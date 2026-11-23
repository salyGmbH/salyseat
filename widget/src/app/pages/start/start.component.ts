import { Component, HostListener, OnInit, NgZone, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { combineLatest, switchMap, of } from 'rxjs';
import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js';

import { environment } from '../../../environments/environment';
import {
  ReservationsService,
  WidgetDesignConfig,
  WidgetFunctionalConfig,
  WidgetAllergen,
  WidgetVenue,
  WidgetVenueTable,
  WidgetVenueWall,
  WidgetVenueDecor,
  WidgetPackage,
  DayAvailability,
  BookedPeriod,
  Break,
  toAtomDateTime,
} from '../../services/reservations.service';
import { WidgetI18nService } from '../../services/widget-i18n.service';

type SubmitState = 'loading' | 'idle' | 'submitting' | 'success' | 'error' | 'payment' | 'paying';

const DEFAULT_FROM = '10:00';
const DEFAULT_TO   = '23:00';

/**
 * Cache für die Canvas-Textmessung (Text-Boxen im Tischplan). Lazy angelegt,
 * damit diese Datei auch außerhalb des Browsers (SSR/Tests) geladen werden
 * kann, ohne beim Import einen Fehler zu werfen.
 */
let labelMeasureCtx: CanvasRenderingContext2D | null | undefined;

function getLabelMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (labelMeasureCtx === undefined) {
    labelMeasureCtx = document.createElement('canvas').getContext('2d');
  }
  return labelMeasureCtx;
}

function buildSlots(from: string, to: string, step: number, breaks: Break[] = []): string[] {
  const slots: string[] = [];
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  let cur = fh * 60 + fm;
  const end = th * 60 + tm;
  while (cur < end) {
    const h = String(Math.floor(cur / 60)).padStart(2, '0');
    const m = String(cur % 60).padStart(2, '0');
    const slot = `${h}:${m}`;
    const inBreak = breaks.some(b => slot >= b.from && slot < b.to);
    if (!inBreak) slots.push(slot);
    cur += step;
  }
  return slots;
}

@Component({
  selector: 'wdg-start',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './start.component.html',
  styleUrl: './start.component.scss',
})
export class StartComponent implements OnInit {
  private readonly reservations = inject(ReservationsService);
  private readonly route        = inject(ActivatedRoute);
  private readonly sanitizer    = inject(DomSanitizer);
  private readonly zone         = inject(NgZone);
  readonly i18n                 = inject(WidgetI18nService);

  /**
   * Schließt ein offenes Card-/Stacked-Picker-Panel (Datum/Uhrzeit/Personen),
   * wenn außerhalb des zugehörigen Feld+Panel-Containers geklickt wird —
   * bisher musste man immer erst eine Auswahl treffen, um das Panel wieder
   * zuzuklappen. Sidebar hat dafür schon einen eigenen Zurück-Button, Planner
   * ist ein Schritt-Wizard ohne Overlay, daher hier nicht nötig.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClickClosePicker(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (this.cardOpenPicker() !== null && !target.closest('.preview-card__group--picker-host')) {
      this.cardClosePicker();
    }
    if (this.stackedOpenPicker() !== null && !target.closest('.preview-stacked__tiles-host')) {
      this.stackedClosePicker();
    }
  }

  /** Shortcut: aktuelles Übersetzungs-Dictionary als computed Signal */
  readonly t = this.i18n.labels;

  // ─── Stripe ──────────────────────────────────────────────────────────────
  private _stripe:   Stripe | null = null;
  private _elements: StripeElements | null = null;

  // ─── Config vom Backend ──────────────────────────────────────────────────
  restaurantName = signal('');
  venues         = signal<WidgetVenue[]>([]);
  selectedVenue  = signal<WidgetVenue | null>(null);

  // ─── Widget-Design (aus widgetDesign-Settings) ───────────────────────────
  layout                = signal<string>('card');
  imageUrl              = signal<string | null>(null);
  cardBackgroundImage    = signal<string | null>(null);
  stackedBackgroundImage = signal<string | null>(null);
  plannerBackgroundImage = signal<string | null>(null);
  headingTitle     = signal('Tisch reservieren');
  headingSubtitle  = signal('');
  headingAlignment = signal<string>('center');
  showSubtitle     = signal(true);
  buttonLabel      = signal('Reservierung absenden');

  // ─── Hilfsfunktion: Datum als YYYY-MM-DD in Ortszeit (NICHT UTC) ─────────
  // new Date().toISOString() liefert UTC — in Deutschland (UTC+2) ist das
  // zwischen 00:00 und 01:59 Uhr LOCAL bereits der gestrige UTC-Tag.
  // Daher immer getFullYear/getMonth/getDate (lokale Zeit) verwenden.
  static localDate(d: Date): string {
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  // ─── Heute als Vorbelegung & Mindestdatum ────────────────────────────────
  readonly today = StartComponent.localDate(new Date());

  // ─── Slot-Auswahl ────────────────────────────────────────────────────────
  date   = signal<string>(this.today);
  time   = signal<string>('19:00');
  people = signal<number>(2);

  // ─── Gastdaten ───────────────────────────────────────────────────────────
  guestName      = signal<string>('');
  guestFirstName = signal<string>('');
  guestEmail     = signal<string>('');
  guestPhone     = signal<string>('');
  notes          = signal<string>('');
  occasion       = signal<string>('');

  // ─── Personen-Stepper ────────────────────────────────────────────────────
  readonly minPeople = 1;

  // ─── Functional settings (aus widgetFunctional-Settings) ─────────────────
  stepMinutes             = signal<number>(30);
  maxPeople               = signal<number>(8);
  requiredFields          = signal<string[]>(['name', 'partySize']);
  speisekarte             = signal<boolean>(false);
  speisekarteType         = signal<string>('url');
  speisekarteUrl          = signal<string>('');
  speisekartePdfName      = signal<string>('');
  hinweistext             = signal<boolean>(false);
  hinweistextUeberschrift = signal<string>('');
  hinweistextInhalt       = signal<string>('');
  hinweistextFooter       = signal<string>('');
  maxPersonenText         = signal<string>('Für größere Gruppen bitten wir um Kontaktaufnahme.');
  maxPersonenPhone        = signal<string>('');
  maxPersonenEmail        = signal<string>('');
  raumauswahl             = signal<boolean>(false);
  raumauswahlAktiveIds    = signal<string[]>([]);
  venueReihenfolge        = signal<{ venueId: string; onlineVerfuegbar: boolean }[]>([]);
  menuOpen                = signal<boolean>(false);
  hinweisOpen             = signal<boolean>(false);
  cardShowErrors          = signal<boolean>(false);
  cardWasOnSummary        = signal<boolean>(false);
  /** Zeigt einen Hinweis, wenn Datum/Uhrzeit/Personen (noch) ungültig sind
   *  (geschlossener Tag, keine freien Zeiten) und "Weiter" deshalb nicht
   *  zum Kontakt-Schritt weitergegangen ist. */
  cardTischwahlError      = signal<boolean>(false);

  dismissHinweis(): void {
    this.hinweisOpen.set(false);
    try { localStorage.setItem('widget.hinweis.dismissed', Date.now().toString()); } catch { /* ignore */ }
  }

  // ─── Kinderstühle ────────────────────────────────────────────────────────
  kinderStuehleAktiv   = signal<boolean>(false);
  kinderStuehleOnline  = signal<number>(2);
  kinderStuehle        = signal<number>(0);

  // ─── Rollstuhl ───────────────────────────────────────────────────────────
  rollstuhlAktiv = signal<boolean>(false);
  rollstuhl      = signal<boolean>(false);

  // ─── Hund ────────────────────────────────────────────────────────────────
  hundAktiv = signal<boolean>(false);
  hund      = signal<boolean>(false);

  // ─── Allergene ───────────────────────────────────────────────────────────
  allergeneAktiv       = signal<boolean>(false);
  verfuegbareAllergene = signal<WidgetAllergen[]>([]);
  selectedAllergene    = signal<string[]>([]);

  toggleAllergen(key: string): void {
    this.selectedAllergene.update(list =>
      list.includes(key) ? list.filter(k => k !== key) : [...list, key]
    );
  }

  isAllergenSelected(key: string): boolean {
    return this.selectedAllergene().includes(key);
  }

  /** Eigener "Extras"-Schritt (Kinderstühle/Rollstuhl/Hund/Allergene) wird nur
   *  angezeigt, wenn mind. eine dieser Optionen in der Admin aktiv ist. */
  readonly hasExtrasStep = computed(() =>
    this.kinderStuehleAktiv() || this.rollstuhlAktiv() || this.hundAktiv() || this.allergeneAktiv()
  );

  // ─── Packages ────────────────────────────────────────────────────────────
  // Pro Package eine Menge wählbar; Summe aller Mengen darf die Personenzahl
  // (people()) nicht überschreiten — ein Package "gilt" pro Person.
  packageBuchungAktiv = signal<boolean>(false);
  verfuegbarePackages = signal<WidgetPackage[]>([]);
  packageQuantities   = signal<Record<string, number>>({});

  readonly totalSelectedPackages = computed(() =>
    Object.values(this.packageQuantities()).reduce((sum, n) => sum + n, 0)
  );

  readonly remainingPackageCapacity = computed(() =>
    Math.max(0, this.people() - this.totalSelectedPackages())
  );

  /** Package-Objekte mit gewählter Menge > 0, für Zusammenfassung/Payload. */
  readonly selectedPackages = computed(() =>
    this.verfuegbarePackages()
      .map(pkg => ({ pkg, quantity: this.packageQuantities()[pkg.id] ?? 0 }))
      .filter(x => x.quantity > 0)
  );

  /**
   * Tatsächlich zu verwendende Dauer in Minuten — berücksichtigt die vom
   * Admin je Package hinterlegte durationHours (z.B. ein 4h-Event-Package),
   * statt immer pauschal defaultDurationMinutes() zu nehmen. Bei mehreren
   * gewählten Packages mit unterschiedlicher Dauer wird die längste genommen
   * (die Reservierung muss so lange blockiert bleiben, wie das längste
   * gebuchte Package dauert). Packages ohne durationHours-Angabe fließen
   * nicht in die Berechnung ein; sind gar keine Packages mit Dauer gewählt,
   * bleibt es beim generischen defaultDurationMinutes().
   */
  readonly effectiveDurationMinutes = computed<number>(() => {
    if (!this.packageBuchungAktiv()) return this.defaultDurationMinutes();
    const hours = this.selectedPackages()
      .map(x => x.pkg.durationHours)
      .filter((h): h is number => typeof h === 'number' && h > 0);
    if (hours.length === 0) return this.defaultDurationMinutes();
    return Math.max(...hours) * 60;
  });

  packageQuantity(id: string): number {
    return this.packageQuantities()[id] ?? 0;
  }

  incrementPackage(id: string): void {
    if (this.remainingPackageCapacity() <= 0) return;
    this.packageQuantities.update(q => ({ ...q, [id]: (q[id] ?? 0) + 1 }));
  }

  decrementPackage(id: string): void {
    this.packageQuantities.update(q => {
      const current = q[id] ?? 0;
      if (current <= 0) return q;
      const next = { ...q, [id]: current - 1 };
      if (next[id] === 0) delete next[id];
      return next;
    });
  }

  // Wird die Personenzahl reduziert (z.B. Stepper, Dropdown, Dial), Package-
  // Mengen automatisch auf die neue Kapazität zurückstutzen (von hinten her).
  private readonly trimPackagesToCapacityEffect = effect(() => {
    const cap = this.people();
    this.packageQuantities.update(q => {
      let total = Object.values(q).reduce((s, n) => s + n, 0);
      if (total <= cap) return q;
      const next = { ...q };
      const ids = Object.keys(next);
      let i = ids.length - 1;
      while (total > cap && i >= 0) {
        const id = ids[i];
        const reduceBy = Math.min(next[id], total - cap);
        next[id] -= reduceBy;
        total -= reduceBy;
        if (next[id] === 0) delete next[id];
        i--;
      }
      return next;
    });
  });

  // Wählt der Gast einen Tisch manuell aus dem Tischplan und geht danach über
  // "Zurück" nochmal auf Schritt 1 (z.B. Personenzahl erhöhen), kann der zuvor
  // gewählte Tisch zu klein werden — oder inzwischen durch eine andere Buchung
  // blockiert sein. Ohne diese Prüfung würde die veraltete Tisch-Auswahl
  // unbemerkt mit an die Reservierung übergeben (siehe weiter()).
  //
  // Wichtig: bei "selbst wählen" (tischwahlChoice === 'selbst') auch die
  // Präferenz selbst zurücksetzen, nicht nur die Tisch-ID. Sonst bleibt
  // needsTischwahlPick() false (da tischwahlChoice noch gesetzt ist), der
  // Zwischenschritt erscheint nicht erneut, und der Gast landet unbemerkt bei
  // der Auto-Zuweisung statt bei seiner ursprünglichen Wahl — derselbe
  // Silent-Bug wie beim ursprünglich gemeldeten Reihenfolge-Problem, nur über
  // den Zurück-Weg statt den Erstaufruf.
  private readonly clearInvalidTableSelectionEffect = effect(() => {
    const id = this.selectedTableId();
    if (id === null) return;
    const table = this.availableTables().find(t => t.id === id);
    if (!table || table.seats < this.people()) {
      this.selectedTableId.set(null);
      if (this.tischwahlChoice() === 'selbst') {
        this.tischwahlChoice.set(null);
      }
    }
  });

  private readonly packageCategoryIcons: Record<string, string> = {
    menu: '🍽️', event: '🎉', feier: '🎂', sonstiges: '🏷️',
  };

  packageCategoryIcon(category: string): string {
    return this.packageCategoryIcons[category] ?? this.packageCategoryIcons['sonstiges'];
  }

  packageCategoryLabel(category: string): string {
    const l = this.t();
    switch (category) {
      case 'menu':   return l.packageCatMenu;
      case 'event':  return l.packageCatEvent;
      case 'feier':  return l.packageCatFeier;
      default:       return l.packageCatSonstiges;
    }
  }

  // ─── Vorausbuchung ───────────────────────────────────────────────────────
  vorausbuchungEinheit = signal<string>('monate');
  vorausbuchungWert    = signal<number>(12);

  // ─── Mindestvorlauf ──────────────────────────────────────────────────────
  mindestvorlaufMinuten     = signal<number>(60);
  defaultDurationMinutes    = signal<number>(120);
  // Puffer vor/nach einer Reservierung, in dem der Tisch für andere Buchungen
  // gesperrt bleibt (0 = Schalter beim Tenant aus). Muss identisch zum
  // Backend-Wert sein (siehe findBestTable() in CreateReservationHandler.php),
  // sonst zeigt timeSlots() Slots als buchbar, die das Backend beim Absenden
  // wegen des Puffers ablehnt.
  cleanupMinutes            = signal<number>(0);

  // ─── Tischarten ──────────────────────────────────────────────────────────
  tischartenAktiv      = signal<boolean>(false);
  tischartenAktiveTypes = signal<string[]>(['round', 'square', 'long']);
  selectedTischart     = signal<string>('');
  tischartenModus      = signal<string>('liste');
  selectedTableId      = signal<number | null>(null);

  // ─── Tischplan-Zwischenschritt ────────────────────────────────────────────
  windowWidth            = signal(typeof window !== 'undefined' ? window.innerWidth : 1024);
  readonly isTablet      = computed(() => this.windowWidth() >= 768);
  // Präferenz "selbst wählen" vs. "automatisch zuweisen" — wird NACH Datum/Uhrzeit/
  // Personenzahl inline abgefragt (siehe needsTischwahlPick()), weil die
  // Verfügbarkeitsprüfung im Tischplan (suitableTables()) selbst von der echten
  // Personenzahl abhängt. Vorher kam diese Abfrage VOR Datum/Uhrzeit/Personenzahl —
  // dadurch wurden im Grundriss nur gegen den Default-Wert (2 Personen) passende
  // Tische markiert, was bei größeren Gruppen zu einer scheinbar zufälligen
  // Warteliste-Landung führte, obwohl der gewählte Tisch nie wirklich gepasst hatte.
  tischwahlChoice        = signal<'auto' | 'selbst' | null>(null);
  tischplanOverlayOpen   = signal(false);   // Vollbild-Tischplan-Overlay
  // Wird erst true, sobald der Gast das Datum/Uhrzeit/Personenzahl-Formular zum ersten
  // Mal verlassen hat. Solange false, bezieht sich die im Tischplan-Overlay gezeigte
  // Verfügbarkeit noch auf die Default-Werte (heute, 19:00) statt auf das echte
  // Wunschdatum — der Hinweistext im Overlay wird nur bis dahin eingeblendet.
  hasPassedInitialDateTime = signal(false);

  // ─── Geschlossene Wochentage (0=Mo … 6=So) ───────────────────────────────
  closedWeekdays = signal<number[]>([]);

  // ─── Sonder-Schließtage (Datumsbereiche) ─────────────────────────────────
  specialClosedRanges = signal<{ date_from: string; date_to: string }[]>([]);

  // ─── Öffnungszeiten-Schedule (Wochentag → Zeiten) ────────────────────────
  openingSchedule = signal<Record<number, { open_time: string | null; close_time: string | null; breaks: { from: string; to: string }[] }>>({});

  /** Gibt true zurück wenn ein YYYY-MM-DD Datum in einem Sonder-Schließbereich liegt. */
  private isSpecialClosed(dateStr: string): boolean {
    return this.specialClosedRanges().some(r => dateStr >= r.date_from && dateStr <= r.date_to);
  }

  // ─── Online Änderungen / Stornierung ─────────────────────────────────────
  onlineAenderungen        = signal<boolean>(false);
  onlineAenderungenMinuten = signal<number>(120);
  onlineStornierung        = signal<boolean>(false);
  onlineStornierungMinuten = signal<number>(120);

  readonly weekdays = computed<readonly string[]>(() =>
    this.i18n.lang() === 'en'
      ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
      : ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
  );
  readonly seatOptions = computed<{ count: number; label: string }[]>(() => {
    const max  = this.maxPeople();
    const lbl  = this.i18n.t();
    return Array.from({ length: max }, (_, i) => {
      const n = i + 1;
      if (n === 1) return { count: 1, label: `1 ${lbl.guest}` };
      return { count: n, label: `${n} ${lbl.guests}` };
    });
  });

  /** Hinweisblock anzeigen wenn Telefon oder E-Mail hinterlegt ist – unabhängig von der gewählten Personenzahl. */
  readonly showMaxPersonenInfo = computed(() =>
    !!(this.maxPersonenPhone() || this.maxPersonenEmail())
  );

  decrement(): void { this.people.update(n => Math.max(this.minPeople, n - 1)); }
  increment(): void { this.people.update(n => Math.min(this.maxPeople(), n + 1)); }

  // ─── Kalender-State ──────────────────────────────────────────────────────
  calendarMonth = signal<number>(new Date().getMonth());
  calendarYear  = signal<number>(new Date().getFullYear());

  // ─── Card-Layout-State ───────────────────────────────────────────────────
  cardStep       = signal<1 | 2 | 3 | 4>(1);
  cardOpenPicker = signal<'date' | 'time' | 'seats' | null>(null);
  cardConsent    = signal(false);

  // ─── Sidebar-Layout-State ─────────────────────────────────────────────────
  sidebarStep          = signal<1 | 2 | 3 | 4>(1);
  sidebarOpenPicker    = signal<'date' | 'time' | 'seats' | null>(null);
  sidebarConsent       = signal(false);
  sidebarWasOnSummary  = signal(false);
  sidebarShowErrors    = signal(false);
  sidebarTischwahlError = signal(false);

  // ─── Stacked-Layout-State ────────────────────────────────────────────────
  stackedStep          = signal<1 | 2 | 3 | 4>(1);
  stackedOpenPicker    = signal<'date' | 'time' | 'seats' | null>(null);
  stackedConsent       = signal(false);
  stackedShowErrors    = signal(false);
  stackedWasOnSummary  = signal(false);
  stackedTischwahlError = signal(false);

  /** Sichtbare Schritt-Position für die 3/4-teilige Fortschrittsanzeige:
   *  ohne Extras-Schritt wird der interne Schritt 4 (Zusammenfassung) auf
   *  die 3. sichtbare Position abgebildet, da Schritt 3 dann übersprungen wird. */
  readonly stackedVisibleStep = computed(() => {
    const s = this.stackedStep();
    if (this.hasExtrasStep()) { return s; }
    return s === 4 ? 3 : s;
  });
  readonly stackedTotalSteps = computed(() => this.hasExtrasStep() ? 4 : 3);

  // ─── Planner-Layout-State ────────────────────────────────────────────────
  plannerStep         = signal<1 | 2 | 3 | 4 | 5>(1);
  plannerMaxStep      = signal<number>(1);
  plannerConsent      = signal(false);
  plannerDialPhase    = signal<'hour' | 'minute'>('hour');
  plannerShowErrors   = signal(false);
  plannerWasOnSummary = signal(false);
  plannerTischwahlError = signal(false);

  // ─── Tag-Verfügbarkeit (ohne Zeit) — für Slot-Filterung ──────────────────
  // Reagiert nur auf Venue + Datum, NICHT auf Zeit. Liefert bookedPeriods +
  // totalTables damit vollständig belegte Slots ausgeblendet werden können.
  readonly dayAvail = toSignal<DayAvailability | null>(
    combineLatest([
      toObservable(this.selectedVenue),
      toObservable(this.date),
    ]).pipe(
      switchMap(([venue, date]) => {
        if (!venue || !date) {
          return of<DayAvailability>({ open: true, open_time: null, close_time: null, breaks: [], reason: null, bookedTableNumbers: [], bookedPeriods: [], totalTables: 0 });
        }
        return this.reservations.checkAvailability(venue.id, date);
      }),
    ),
    { initialValue: null },
  );

  // ─── Slot-Verfügbarkeit (mit Zeit) — für konkret gewählten Slot ──────────
  readonly availability = toSignal<DayAvailability | null>(
    combineLatest([
      toObservable(this.selectedVenue),
      toObservable(this.date),
      toObservable(this.time),
    ]).pipe(
      switchMap(([venue, date, time]) => {
        if (!venue || !date) {
          return of<DayAvailability>({ open: true, open_time: null, close_time: null, breaks: [], reason: null, bookedTableNumbers: [], bookedPeriods: [], totalTables: 0 });
        }
        return this.reservations.checkAvailability(venue.id, date, time || undefined);
      }),
    ),
    { initialValue: null },
  );

  // null = noch am Laden → als gesperrt behandeln um Race-Condition zu vermeiden
  readonly isClosedDay = computed(() => {
    const avail = this.dayAvail();
    return avail === null || avail.open === false;
  });

  readonly showMaxPersonenWarning = computed(() => this.people() >= this.maxPeople());

  readonly groupInfoText = computed(() => {
    const max    = this.maxPeople();
    const custom = this.maxPersonenText().trim();
    // {{max}} wird 1:1 wie in der Admin-Vorschau (maxPersonenPreviewText) ersetzt,
    // damit der Text im Widget exakt dem entspricht, was der Inhaber beim
    // Konfigurieren als Vorschau sieht. Nur falls das Feld leer ist (z.B. alte
    // Bestandsdaten ohne diesen Text), greift der bisherige Standardtext.
    if (custom) return custom.replace('{{max}}', String(max));
    return `Ab ${max + 1} Personen oder mehr bitten wir um direkte Kontaktaufnahme.`;
  });

  readonly safeMenuUrl = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.speisekarteUrl() || '')
  );

  readonly filteredVenues = computed<WidgetVenue[]>(() => {
    const all        = this.venues();
    const reihenfolge = this.venueReihenfolge();
    const date       = this.date();

    // Step 1: apply raumauswahl filter (active room IDs)
    let result = all;
    if (this.raumauswahl() && this.raumauswahlAktiveIds().length > 0) {
      const ids = this.raumauswahlAktiveIds();
      result = result.filter(v => ids.includes(v.id));
    }

    // Step 2: filter out venues explicitly marked as offline
    if (reihenfolge.length > 0) {
      const offlineIds = new Set(
        reihenfolge.filter(r => !r.onlineVerfuegbar).map(r => r.venueId)
      );
      result = result.filter(v => !offlineIds.has(v.id));
    }

    // Step 3: filter out venues blocked for the selected date
    if (date) {
      result = result.filter(v => !this.isVenueBlockedOn(v, date));
    }

    // Step 4: sort by venueReihenfolge position (unlisted venues go to end)
    if (reihenfolge.length > 0) {
      const posMap = new Map(reihenfolge.map((r, i) => [r.venueId, i]));
      result = [...result].sort((a, b) => {
        const posA = posMap.has(a.id) ? posMap.get(a.id)! : 9999;
        const posB = posMap.has(b.id) ? posMap.get(b.id)! : 9999;
        return posA - posB;
      });
    }

    return result;
  });

  /**
   * true, solange bei aktiver Raumauswahl mit mehreren Räumen noch kein Raum gewählt
   * wurde. Das Widget zeigt dann zuerst den Raum-Picker, bevor Datum/Uhrzeit
   * angezeigt werden — sonst würde Datum/Uhrzeit auf Basis eines beliebig
   * vorbelegten Raums berechnet und könnte beim späteren Raumwechsel im
   * Formular still auf einen anderen (verfügbaren) Slot springen, ohne dass es
   * dem Gast auffällt (siehe weiter() weiter unten: slots.includes(raw) ? raw : slots[0]).
   */
  readonly needsVenuePick = computed<boolean>(() =>
    this.raumauswahl() && this.filteredVenues().length > 1 && !this.selectedVenue()
  );

  /**
   * Ist die Tisch-Planauswahl aktiv, wird die Präferenz "selbst wählen" vs.
   * "automatisch zuweisen" als Zwischenschritt NACH Datum/Uhrzeit/Personenzahl
   * abgefragt (siehe hasPassedInitialDateTime — wird erst wahr, sobald Schritt 1
   * einmal gültig verlassen wurde, siehe proceedAfterTischwahl()). So kann der
   * Grundriss die im Overlay angezeigte Passend-Markierung (suitableTables())
   * von Anfang an gegen die tatsächlich eingegebene Personenzahl prüfen, statt
   * gegen den Default-Wert. Sobald tischwahlChoice() gesetzt ist, verschwindet
   * dieser Zwischenschritt wieder.
   *
   * Zusätzliche Bedingung suitableTables().length > 0: passt KEIN einzelner
   * Tisch zur Personenzahl (z.B. 11 Personen, größter Tisch 6P), wäre "selbst
   * wählen" ohnehin eine Sackgasse — im Grundriss ist dann jeder Tisch
   * ausgegraut und nichts anklickbar. In dem Fall den Zwischenschritt ganz
   * überspringen und direkt zur automatischen Zuweisung durchreichen, die
   * (im Gegensatz zur manuellen Auswahl) auch Tische kombinieren kann, siehe
   * findBestCombination() im Backend. tischwahlChoice bleibt bewusst null
   * (nicht auf 'auto' gesetzt) — reduziert der Gast die Personenzahl später
   * wieder auf einen Wert mit passendem Einzeltisch, erscheint der
   * Zwischenschritt dadurch von selbst erneut.
   */
  readonly needsTischwahlPick = computed<boolean>(() =>
    this.tischartenAktiv() && this.tischartenModus() === 'plan'
      && this.tischwahlChoice() === null && this.hasPassedInitialDateTime()
      && this.suitableTables().length > 0
  );

  private isVenueBlockedOn(venue: WidgetVenue, date: string): boolean {
    return (venue.blockedRanges ?? []).some(r =>
      r.full_day && r.date_from <= date && r.date_to >= date
    );
  }

  /**
   * Prüft, ob die übergebenen freien Tische für `needed` Personen reichen —
   * entweder ein einzelner Tisch, oder eine über combinableWith verknüpfte
   * Gruppe freier Tische zusammen. Spiegelt findBestCombination() /
   * searchCombination() im Backend (CreateReservationHandler.php), aber nur
   * als Existenz-Check für die Slot-Anzeige im Widget: es reicht ein Ja/Nein
   * (wird hier eine passende Gruppe gefunden, mit Early-Exit), die "beste"
   * (verschwendungsärmste) Kombination muss nicht ermittelt werden — das
   * macht ausschließlich das Backend beim tatsächlichen Buchen.
   *
   * Es werden bewusst NUR Tische kombiniert, die der Admin im Tischplan-
   * Editor ("Kombinieren-Modus") explizit als nebeneinanderstehend markiert
   * hat (combinableWith) — nie beliebige freie Tische im selben Raum.
   */
  /**
   * Tische, die im Zeitfenster [slotStart, slotEnd) (Minuten seit Mitternacht)
   * durch eine bestehende Reservierung belegt sind — inkl. Clean-up-Puffer
   * symmetrisch vor/nach dem Slot (cleanupMinutes()). Spiegelt die
   * Fenstererweiterung in findBestTable()/getBookedTableNumbers() im Backend
   * (CreateReservationHandler.php): ohne diesen Puffer könnte das Widget
   * einen Slot als buchbar anzeigen, den das Backend beim echten Absenden
   * wegen des Puffers ablehnt — die Reservierung landet dann unbemerkt auf
   * der Warteliste. cleanupMinutes()===0 (Schalter beim Tenant aus) ergibt
   * exakt die Prüfung ohne Puffer.
   */
  private busyTableIdsAt(periods: BookedPeriod[], slotStart: number, slotEnd: number): Set<number> {
    const cleanup        = this.cleanupMinutes();
    const bufferedStart  = slotStart - cleanup;
    const bufferedEnd    = slotEnd + cleanup;
    const busy = new Set<number>();
    for (const p of periods) {
      const [fh, fm] = p.from.split(':').map(Number);
      const [th, tm] = p.to.split(':').map(Number);
      const pStart = fh * 60 + fm;
      const pEnd   = th * 60 + tm;
      if (pStart < bufferedEnd && pEnd > bufferedStart) busy.add(p.tableNumber);
    }
    return busy;
  }

  private canPartyBeSeated(freeTables: WidgetVenueTable[], needed: number): boolean {
    if (freeTables.some(t => t.seats >= needed)) return true;

    const byId = new Map(freeTables.map(t => [t.id, t]));
    const maxGroupSize = 5; // identisch zu maxGroupSize im Backend

    const search = (chosen: Set<number>, totalSeats: number): boolean => {
      if (totalSeats >= needed) return true;
      if (chosen.size >= maxGroupSize) return false;

      const frontier = new Set<number>();
      for (const id of chosen) {
        for (const neighborId of byId.get(id)?.combinableWith ?? []) {
          if (byId.has(neighborId) && !chosen.has(neighborId)) frontier.add(neighborId);
        }
      }

      for (const nextId of frontier) {
        const next = byId.get(nextId)!;
        chosen.add(nextId);
        if (search(chosen, totalSeats + next.seats)) return true;
        chosen.delete(nextId);
      }
      return false;
    };

    for (const start of freeTables) {
      if (search(new Set([start.id]), start.seats)) return true;
    }
    return false;
  }

  readonly timeSlots = computed<string[]>(() => {
    const avail = this.dayAvail();
    if (avail?.open === false) return [];
    const from   = avail?.open_time  ?? DEFAULT_FROM;
    const to     = avail?.close_time ?? DEFAULT_TO;
    const breaks = avail?.breaks     ?? [];
    let slots = buildSlots(from, to, this.stepMinutes(), breaks);

    // Vergangene Slots heute ausblenden
    if (this.date() === this.today) {
      const now = new Date();
      const cutoff = now.getHours() * 60 + now.getMinutes() + this.mindestvorlaufMinuten();
      slots = slots.filter(s => {
        const [h, mm] = s.split(':').map(Number);
        return h * 60 + mm >= cutoff;
      });
    }

    // Slots ausblenden die in einer Raumsperrung liegen
    const blockedRanges = avail?.blockedRanges ?? [];
    if (blockedRanges.length > 0) {
      slots = slots.filter(slotTime => {
        const [sh, sm] = slotTime.split(':').map(Number);
        const slotMin = sh * 60 + sm;
        return !blockedRanges.some(br => {
          const [fh, fm] = br.from.split(':').map(Number);
          const [th, tm] = br.to.split(':').map(Number);
          return slotMin >= fh * 60 + fm && slotMin < th * 60 + tm;
        });
      });
    }

    // Slots ausblenden wo der Tisch/Raum belegt ist.
    // Ist über "selbst wählen" bereits ein konkreter Tisch vorausgewählt
    // (selectedTableId), wird NUR gegen dessen eigene Buchungsperioden
    // geprüft — nicht mehr aggregiert über alle Tische im Raum, da genau
    // dieser Tisch reserviert werden soll.
    //
    // Ohne Vorauswahl (Auto-Pfad, der Normalfall) reicht es NICHT zu prüfen,
    // ob irgendein Tisch frei ist (concurrent < totalTables) — ein Slot darf
    // nur als buchbar gelten, wenn mindestens ein freier Tisch (oder eine
    // freie, vom Admin verknüpfte Tischgruppe, siehe canPartyBeSeated()) auch
    // GROSS GENUG für die eingegebene Personenzahl ist. Sonst sieht ein Slot
    // im Widget "verfügbar" aus, obwohl real kein passender Tisch da ist, und
    // der Gast landet nach dem Absenden unbemerkt auf der Warteliste, obwohl
    // die Buchung im Widget wie ein normaler Erfolg aussah.
    //
    // venueTables() liefert die Sitzplatzdaten (inkl. combinableWith) pro
    // Tisch bereits lokal aus der Venue-Konfiguration — unabhängig vom
    // Tischarten-Feature, daher ohne zusätzlichen Backend-Call nutzbar. Nur
    // wenn ein Venue gar keinen Tischplan hinterlegt hat (venueTables()
    // leer), bleibt die alte Aggregat-Prüfung als Fallback bestehen.
    const periods         = avail?.bookedPeriods ?? [];
    const totalTables     = avail?.totalTables ?? 0;
    const duration        = this.effectiveDurationMinutes();
    const tableId         = this.selectedTableId();
    const needed          = this.people();
    const tables          = this.venueTables();
    // Tage-Sperren (Admin-"Tisch blockieren", z.B. Reparatur) — gilt hier
    // pauschal für den ganzen Tag (dayAvail() fragt ohne konkrete Uhrzeit ab),
    // ist also bewusst konservativ: lieber ein Slot zu wenig zeigen als einen
    // gesperrten Tisch fälschlich als verfügbar werten.
    const blockedTableIds = new Set(avail?.blockedTableNumbers ?? []);

    if (tableId !== null) {
      const tablePeriods = periods.filter(p => p.tableNumber === tableId);
      if (tablePeriods.length > 0) {
        slots = slots.filter(slotTime => {
          const [sh, sm] = slotTime.split(':').map(Number);
          const slotStart = sh * 60 + sm;
          const slotEnd   = slotStart + duration;
          return !this.busyTableIdsAt(periods, slotStart, slotEnd).has(tableId);
        });
      }
    } else if (tables.length > 0) {
      slots = slots.filter(slotTime => {
        const [sh, sm] = slotTime.split(':').map(Number);
        const slotStart = sh * 60 + sm;
        const slotEnd   = slotStart + duration;
        const busyIds    = this.busyTableIdsAt(periods, slotStart, slotEnd);
        const freeTables = tables.filter(t => !busyIds.has(t.id) && !blockedTableIds.has(t.id));
        return this.canPartyBeSeated(freeTables, needed);
      });
    } else if (totalTables > 0 && periods.length > 0) {
      // Fallback für Venues ohne Tischplan-Daten (keine Sitzplatz-Info pro
      // Tisch vorhanden) — alte Aggregat-Prüfung, jetzt über busyTableIdsAt()
      // immerhin mit Clean-up-Puffer, kann Kapazität/Sperren aber mangels
      // Tischdaten weiterhin nicht berücksichtigen.
      slots = slots.filter(slotTime => {
        const [sh, sm] = slotTime.split(':').map(Number);
        const slotStart = sh * 60 + sm;
        const slotEnd   = slotStart + duration;
        return this.busyTableIdsAt(periods, slotStart, slotEnd).size < totalTables;
      });
    }

    return slots;
  });

  /**
   * Gibt die angezeigte Uhrzeit zurück.
   * Wenn noch keine Slots geladen sind (Ladezeit zwischen Datumswechsel),
   * wird die zuletzt gewählte Zeit beibehalten statt '' — verhindert
   * den kurzen Moment wo nur „Uhr" angezeigt wird.
   */
  readonly validTime = computed(() => {
    const slots = this.timeSlots();
    const t = this.time();
    if (slots.length === 0) return t;          // Fallback: aktuelle Zeit, kein Leerlauf
    return slots.includes(t) ? t : slots[0];
  });

  /** Gibt es tatsächlich buchbare Slots für das gewählte Datum? */
  readonly hasBookableSlots = computed(() => this.timeSlots().length > 0);

  // ─── Warteliste ──────────────────────────────────────────────────────────
  wartelisteAktiv          = signal(false);
  wartelisteMaxPlaetze     = signal(3);
  wartelisteKanal          = signal<'email' | 'telefon' | 'beide'>('email');
  wartelisteAntwortStunden = signal(24);
  wartelisteHinweis        = signal('');

  /**
   * Zeitslots, die für das gewählte Datum vollständig ausgebucht sind — Gegenstück
   * zu `timeSlots` (die genau diese Slots ausblendet). Wird nur befüllt, wenn die
   * Warteliste aktiv ist; hat sonst keinerlei Effekt auf das bestehende Verhalten.
   * Bewusst als eigener Computed implementiert statt `timeSlots` zu erweitern,
   * damit die bestehende Slot-Filterung unangetastet bleibt.
   */
  readonly waitlistSlots = computed<string[]>(() => {
    if (!this.wartelisteAktiv()) return [];

    const avail = this.dayAvail();
    if (avail?.open === false) return [];
    const from   = avail?.open_time  ?? DEFAULT_FROM;
    const to     = avail?.close_time ?? DEFAULT_TO;
    const breaks = avail?.breaks     ?? [];
    let slots = buildSlots(from, to, this.stepMinutes(), breaks);

    if (this.date() === this.today) {
      // Bewusst ohne mindestvorlaufMinuten: Ein Wartelisten-Eintrag ist keine
      // garantierte Reservierung, sondern nur die Chance auf einen frei
      // werdenden Tisch — die Vorlaufzeit-Regel für echte Buchungen greift hier
      // nicht. Nur tatsächlich vergangene Zeiten werden ausgeschlossen.
      const now = new Date();
      const cutoff = now.getHours() * 60 + now.getMinutes();
      slots = slots.filter(s => {
        const [h, mm] = s.split(':').map(Number);
        return h * 60 + mm >= cutoff;
      });
    }

    const blockedRanges = avail?.blockedRanges ?? [];
    if (blockedRanges.length > 0) {
      slots = slots.filter(slotTime => {
        const [sh, sm] = slotTime.split(':').map(Number);
        const slotMin = sh * 60 + sm;
        return !blockedRanges.some(br => {
          const [fh, fm] = br.from.split(':').map(Number);
          const [th, tm] = br.to.split(':').map(Number);
          return slotMin >= fh * 60 + fm && slotMin < th * 60 + tm;
        });
      });
    }

    const periods         = avail?.bookedPeriods ?? [];
    const totalTables     = avail?.totalTables ?? 0;
    const duration        = this.effectiveDurationMinutes();
    const needed          = this.people();
    const tables          = this.venueTables();
    const blockedTableIds = new Set(avail?.blockedTableNumbers ?? []);

    // Gegenstück zur kapazitätsbewussten Prüfung in timeSlots(): ein Slot
    // gilt hier als "Warteliste anbieten", wenn KEIN freier Tisch bzw. keine
    // freie Tischgruppe (canPartyBeSeated(), inkl. combinableWith) mehr für
    // die Personenzahl reicht — nicht erst, wenn wirklich alle Tische belegt
    // sind. So verschwindet ein zu kleiner Slot nicht einfach spurlos aus dem
    // Widget, sondern der Gast bekommt bewusst die Warteliste angeboten.
    // busyTableIdsAt() berücksichtigt den Clean-up-Puffer identisch zu
    // timeSlots() (siehe dort für die Begründung).
    if (tables.length > 0) {
      return slots.filter(slotTime => {
        const [sh, sm] = slotTime.split(':').map(Number);
        const slotStart = sh * 60 + sm;
        const slotEnd   = slotStart + duration;
        const busyIds    = this.busyTableIdsAt(periods, slotStart, slotEnd);
        const freeTables = tables.filter(t => !busyIds.has(t.id) && !blockedTableIds.has(t.id));
        return !this.canPartyBeSeated(freeTables, needed);
      });
    }

    if (totalTables === 0 || periods.length === 0) return [];

    return slots.filter(slotTime => {
      const [sh, sm] = slotTime.split(':').map(Number);
      const slotStart = sh * 60 + sm;
      const slotEnd   = slotStart + duration;
      return this.busyTableIdsAt(periods, slotStart, slotEnd).size >= totalTables;
    });
  });

  // ─── Warteliste-Anmeldung (eigenständiges Formular, unabhängig vom Buchungsflow) ──
  waitlistModalOpen   = signal(false);
  waitlistSlotTime    = signal<string | null>(null);
  waitlistGuestName   = signal('');
  waitlistGuestEmail  = signal('');
  waitlistGuestPhone  = signal('');
  waitlistPartySize   = signal(2);
  waitlistSubmitting  = signal(false);
  waitlistSuccess     = signal(false);
  waitlistError       = signal('');

  readonly waitlistEmailLooksOk = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.waitlistGuestEmail().trim()));

  /** Telefon zusätzlich zur E-Mail verlangen, wenn der Inhaber "Telefon" oder
   *  "Beide" als Warteliste-Kontaktkanal gewählt hat. Die E-Mail selbst bleibt
   *  in jedem Fall Pflicht — der Warteliste-Eintrag (WaitlistEntry) und die
   *  Benachrichtigungs-Mail sind backend-seitig fest an eine E-Mail-Adresse
   *  gebunden (nicht nullable), ein reiner "nur Telefon, keine E-Mail"-Kanal
   *  würde eine Backend-Schemaänderung + SMS-Versand erfordern. */
  readonly waitlistPhoneRequired = computed(() => {
    const kanal = this.wartelisteKanal();
    return kanal === 'telefon' || kanal === 'beide';
  });

  readonly waitlistCanSubmit = computed(() =>
    this.waitlistGuestName().trim().length >= 2 &&
    this.waitlistEmailLooksOk() &&
    (!this.waitlistPhoneRequired() || this.waitlistGuestPhone().trim().length > 0) &&
    this.waitlistPartySize() >= 1
  );

  openWaitlistForm(slot: string): void {
    this.waitlistSlotTime.set(slot);
    this.waitlistGuestName.set('');
    this.waitlistGuestEmail.set('');
    this.waitlistGuestPhone.set('');
    this.waitlistPartySize.set(this.people() || 2);
    this.waitlistSuccess.set(false);
    this.waitlistError.set('');
    this.waitlistModalOpen.set(true);
  }

  closeWaitlistModal(): void {
    this.waitlistModalOpen.set(false);
  }

  submitWaitlist(): void {
    const venue = this.selectedVenue();
    const date  = this.date();
    const slot  = this.waitlistSlotTime();
    if (!venue || !date || !slot || !this.waitlistCanSubmit()) return;

    this.waitlistSubmitting.set(true);
    this.waitlistError.set('');

    this.reservations.joinWaitlist({
      venue_id:     venue.id,
      requested_at: toAtomDateTime(date, slot),
      party_size:   this.waitlistPartySize(),
      guest_name:   this.waitlistGuestName().trim(),
      guest_email:  this.waitlistGuestEmail().trim(),
      guest_phone:  this.waitlistGuestPhone().trim() || undefined,
    }).subscribe({
      next: () => {
        this.waitlistSubmitting.set(false);
        this.waitlistSuccess.set(true);
      },
      error: (err) => {
        this.waitlistSubmitting.set(false);
        const body = err?.error;
        if (body?.error) {
          this.waitlistError.set(body.error);
        } else if (body?.errors) {
          this.waitlistError.set(Object.values(body.errors).join(' '));
        } else {
          this.waitlistError.set('Eintragung fehlgeschlagen. Bitte versuche es erneut.');
        }
      },
    });
  }

  // ─── Zahlung ─────────────────────────────────────────────────────────────
  zahlungAktiv         = signal(false);
  zahlungPflicht       = signal(false);
  noShowSchutzAktiv    = signal(false);
  noShowWidgetText     = signal('Kreditkarte wird nur bei Nicht-Erscheinen belastet.');
  stripePublishableKey = signal<string | null>(null);
  paymentError         = signal('');
  private _paymentMode: 'charge' | 'authorize' = 'charge';

  // ─── Submit-Status ───────────────────────────────────────────────────────
  state        = signal<SubmitState>('loading');
  errorMessage = signal<string>('');
  successInfo  = signal<{ name: string; date: string; time: string; people: number; venue: string } | null>(null);

  // ─── Validität ───────────────────────────────────────────────────────────
  readonly emailLooksOk = computed(() =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.guestEmail().trim()),
  );

  readonly canSubmit = computed(() => {
    const l = this.layout();
    const consent = l === 'card'    ? this.cardConsent() :
                    l === 'sidebar' ? this.sidebarConsent() :
                    l === 'stacked' ? this.stackedConsent() :
                    this.plannerConsent();
    const req = this.requiredFields();
    return this.tischwahlValid() &&
      this.guestName().trim().length >= 2 &&
      this.emailLooksOk() &&
      (!req.includes('phone') || this.guestPhone().trim().length > 0) &&
      (!req.includes('notes') || this.notes().trim().length > 0) &&
      (!req.includes('vorname') || this.guestFirstName().trim().length > 0) &&
      (!req.includes('anlass') || this.occasion().trim().length > 0) &&
      (!this.tischartenAktiv() || this.tischartenModus() !== 'liste' || !!this.selectedTischart()) &&
      consent &&
      this.state() !== 'submitting';
  });

  /** Prüft ob Bereich/Datum/Uhrzeit/Personenzahl bereits gültig sind — steuert
   *  in ALLEN 4 Layouts (card/sidebar/stacked/planner), ob vom Tischwahl-Schritt
   *  aus direkt zu Kontakt weitergegangen werden darf, oder ob (z.B. wegen
   *  geschlossenem Tag / keinen freien Zeiten mehr) erst noch nachgebessert
   *  werden muss, bevor man den Gast unnötig Kontaktdaten eintippen lässt. */
  readonly tischwahlValid = computed(() =>
    !!this.selectedVenue() &&
    !!this.date() &&
    !this.isClosedDay() &&
    this.hasBookableSlots() &&
    !!this.validTime() &&
    this.people() >= this.minPeople,
  );

  /** Prüft ob Formulardaten vollständig sind → für "Weiter zur Zusammenfassung".
   *  Nutzt dieselbe Basis-Prüfung (Bereich/Datum/Uhrzeit/Personenzahl) wie
   *  `canSubmit()` über `tischwahlValid()` — vorher fehlten hier z.B. die
   *  Prüfungen auf gewählten Bereich, gesetztes Datum und Mindestpersonenzahl,
   *  wodurch man rein rechnerisch zur Zusammenfassung kommen konnte, obwohl
   *  `canSubmit()` danach trotzdem noch false gewesen wäre. */
  readonly canGoToSummary = computed(() => {
    const req = this.requiredFields();
    const l = this.layout();
    const consent = l === 'sidebar' ? this.sidebarConsent() :
                    l === 'stacked' ? this.stackedConsent() :
                    l === 'planner' ? this.plannerConsent() :
                    this.cardConsent();
    return this.tischwahlValid() &&
      this.guestName().trim().length >= 2 &&
      this.emailLooksOk() &&
      (!req.includes('phone') || this.guestPhone().trim().length > 0) &&
      (!req.includes('notes') || this.notes().trim().length > 0) &&
      (!req.includes('vorname') || this.guestFirstName().trim().length > 0) &&
      (!req.includes('anlass') || this.occasion().trim().length > 0) &&
      (!this.tischartenAktiv() || this.tischartenModus() !== 'liste' || !!this.selectedTischart()) &&
      consent;
  });

  /** Label der gewählten Tischart (für Zusammenfassung) */
  readonly selectedTischartenLabel = computed(() =>
    this.alleTischarten.find(t => t.key === this.selectedTischart())?.label ?? this.selectedTischart()
  );

  /** Kommagetrennte Allergenlabels (für Zusammenfassung) */
  readonly selectedAllergeneLabels = computed(() =>
    this.selectedAllergene()
      .map(key => this.verfuegbareAllergene().find(a => a.key === key)?.label ?? key)
      .join(', ')
  );

  // ─── Computed: selectedDay ───────────────────────────────────────────────
  readonly selectedDay = computed(() => {
    const d = this.date();
    return d ? parseInt(d.split('-')[2], 10) : new Date().getDate();
  });

  // ─── titleWords (Sidebar Heading) ────────────────────────────────────────
  readonly titleWords = computed(() =>
    this.headingTitle().trim().split(/\s+/).filter(w => w.length > 0));

  // ─── Calendar month label ─────────────────────────────────────────────────
  readonly calendarMonthLabel = computed(() => {
    const months = this.i18n.lang() === 'en'
      ? ['January', 'February', 'March', 'April', 'May', 'June',
         'July', 'August', 'September', 'October', 'November', 'December']
      : ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
         'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    return `${months[this.calendarMonth()]} ${this.calendarYear()}`;
  });

  // ─── Calendar cells ──────────────────────────────────────────────────────
  readonly calendarCells = computed(() => {
    const m = this.calendarMonth();
    const y = this.calendarYear();
    const firstOfMonth = new Date(y, m, 1);
    const monthStartWeekday = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === y && now.getMonth() === m;
    const todayDay = now.getDate();
    const sel = this.selectedDay();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const maxD = new Date(now);
    if (this.vorausbuchungEinheit() === 'tage') {
      maxD.setDate(maxD.getDate() + this.vorausbuchungWert());
    } else {
      maxD.setMonth(maxD.getMonth() + this.vorausbuchungWert());
    }
    maxD.setHours(23, 59, 59, 999);
    const closed        = this.closedWeekdays();
    const specialRanges = this.specialClosedRanges();
    const schedule      = this.openingSchedule();
    const step          = this.stepMinutes();
    const minLead       = this.mindestvorlaufMinuten();
    const nowMinutes    = now.getHours() * 60 + now.getMinutes();

    const cells: { day: number | null; isToday: boolean; isSelected: boolean; isDisabled: boolean }[] = [];
    for (let i = 0; i < monthStartWeekday; i++) cells.push({ day: null, isToday: false, isSelected: false, isDisabled: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(y, m, d);
      const weekday  = (cellDate.getDay() + 6) % 7;
      const dateStr  = StartComponent.localDate(cellDate);
      const isCellToday = isCurrentMonth && d === todayDay;

      const isSpecialClosed = specialRanges.some(r => dateStr >= r.date_from && dateStr <= r.date_to);

      let isDisabled = cellDate < todayStart || cellDate > maxD || closed.includes(weekday) || isSpecialClosed;

      // Prüfen ob an diesem Tag noch buchbare Slots verbleiben.
      // Für heute: echte Schließzeit aus dem Schedule nutzen statt 23:00 hardcoded.
      // Für zukünftige Tage: Prüfen ob überhaupt Öffnungszeiten existieren die Slots liefern.
      if (!isDisabled) {
        const sched      = schedule[weekday];
        const openStr    = sched?.open_time  ?? DEFAULT_FROM;
        const closeStr   = sched?.close_time ?? DEFAULT_TO;
        const [oh, om]   = openStr.split(':').map(Number);
        const [ch, cm]   = closeStr.split(':').map(Number);
        const openMin    = oh * 60 + om;
        const closeMin   = ch * 60 + cm;
        const cutoff     = isCellToday ? nowMinutes + minLead : openMin;

        // Ersten gültigen Slot suchen: start >= cutoff und < closeMin
        let firstSlot = openMin;
        while (firstSlot < closeMin && firstSlot < cutoff) firstSlot += step;
        if (firstSlot >= closeMin) {
          isDisabled = true;
        }
      }

      cells.push({ day: d, isToday: isCellToday, isSelected: d === sel, isDisabled });
    }
    return cells;
  });

  // ─── Selected date label "DD.MM.YYYY" ────────────────────────────────────
  readonly selectedDateLabel = computed(() => {
    const d = this.selectedDay().toString().padStart(2, '0');
    const m = (this.calendarMonth() + 1).toString().padStart(2, '0');
    return `${d}.${m}.${this.calendarYear()}`;
  });

  // ─── Stacked short date label ─────────────────────────────────────────────
  readonly stackedShortDateLabel = computed(() => {
    const day = this.selectedDay().toString().padStart(2, '0');
    const months = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];
    return { day, month: months[this.calendarMonth()] };
  });

  // ─── Dial computeds ──────────────────────────────────────────────────────
  private dialAngleForMinutes(min: number): number {
    return (min / 1440) * 360;
  }

  readonly dialOpenRange = computed(() => {
    const slots = this.timeSlots();
    const minutes = slots.map(s => {
      const [h, m] = s.split(':').map(Number);
      return h * 60 + m;
    });
    if (minutes.length === 0) {
      return { startMin: 0, endMin: 0, startHour: 0, endHour: 0 };
    }
    const startMin = Math.min(...minutes);
    const endMin   = Math.max(...minutes);
    return {
      startMin,
      endMin,
      startHour: Math.floor(startMin / 60),
      endHour:   Math.ceil(endMin / 60),
    };
  });

  readonly dialHours = computed(() => {
    const cx = 70, cy = 70, r = 53;
    const range = this.dialOpenRange();
    const round = (n: number) => Math.round(n * 100) / 100;

    return Array.from({ length: 24 }, (_, h) => {
      const clockAngle = this.dialAngleForMinutes(h * 60);
      const mathRad    = ((clockAngle - 90) * Math.PI) / 180;
      const isOpen     = h >= range.startHour && h <= range.endHour;
      return {
        hour: h,
        label: String(h),
        x: round(cx + r * Math.cos(mathRad)),
        y: round(cy + r * Math.sin(mathRad)),
        isOpen,
        isCardinal: h % 6 === 0,
      };
    });
  });

  readonly dialSlots = computed(() => {
    const cx = 70, cy = 70, r = 60;
    const round = (n: number) => Math.round(n * 100) / 100;

    return this.timeSlots().map(s => {
      const [h, m] = s.split(':').map(Number);
      const totalMin = h * 60 + m;
      const clockAngle = this.dialAngleForMinutes(totalMin);
      const mathRad = ((clockAngle - 90) * Math.PI) / 180;
      return {
        label: s,
        clockAngle,
        x: round(cx + r * Math.cos(mathRad)),
        y: round(cy + r * Math.sin(mathRad)),
        isHour: m === 0,
      };
    });
  });

  // ─── Zweistufiger Planner-Dial ───────────────────────────────────────────

  /** Intervall in Minuten, aus den timeSlots abgeleitet. */
  readonly dialIntervalMinutes = computed(() => {
    const slots = this.timeSlots();
    if (slots.length < 2) return 60;
    const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    return toMin(slots[1]) - toMin(slots[0]);
  });

  /** Deduplizierte verfügbare Stunden. */
  readonly dialAvailableHours = computed(() => {
    const slots = this.timeSlots();
    return [...new Set(slots.map(s => parseInt(s.split(':')[0], 10)))];
  });

  /**
   * SVG-Positionen aller 24 Stunden auf einem Ring (r=55).
   * 15° pro Stunde (360/24), 0h = oben.
   * Verfügbare Stunden = isAvailable true.
   */
  readonly dialPhaseHourDots = computed(() => {
    const cx = 70, cy = 70, r = 49;
    const round = (n: number) => Math.round(n * 100) / 100;
    const availableSet = new Set(this.dialAvailableHours());
    return Array.from({ length: 24 }, (_, h) => {
      const deg = h * 15 - 90;
      const rad = deg * Math.PI / 180;
      return {
        hour:        h,
        label:       String(h),
        x:           round(cx + r * Math.cos(rad)),
        y:           round(cy + r * Math.sin(rad)),
        angleDeg:    h * 15,
        isAvailable: availableSet.has(h),
      };
    });
  });

  /** Y-Endpunkt der Nadel — folgt dem Dot-Radius (r=49 → y=21). */
  readonly dialPhaseNeedleEndY = computed(() => 21);

  /** SVG-Positionen der Minuten-Dots je nach Intervall. */
  readonly dialPhaseMinuteDots = computed(() => {
    const cx = 70, cy = 70, r = 46;
    const interval = this.dialIntervalMinutes();
    const round = (n: number) => Math.round(n * 100) / 100;
    const minutes: number[] = [];
    for (let m = 0; m < 60; m += interval) minutes.push(m);
    return minutes.map(m => {
      const deg = m * 6 - 90;
      const rad = deg * Math.PI / 180;
      return { minute: m, label: String(m).padStart(2, '0'), x: round(cx + r * Math.cos(rad)), y: round(cy + r * Math.sin(rad)), angleDeg: m * 6 };
    });
  });

  /** Nadelwinkel: 15° pro Stunde (24h-Ring) oder 6° pro Minute. */
  readonly dialPhaseNeedleAngle = computed(() => {
    const [h, m] = this.validTime().split(':').map(Number);
    return this.plannerDialPhase() === 'hour' ? h * 15 : m * 6;
  });

  readonly dialOpenArc = computed(() => {
    const range = this.dialOpenRange();
    if (range.startMin === range.endMin) return '';

    const cx = 70, cy = 70, r = 62;
    const startAngle = this.dialAngleForMinutes(range.startMin);
    const endAngle   = this.dialAngleForMinutes(range.endMin);
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad   = ((endAngle - 90) * Math.PI) / 180;
    const round = (n: number) => Math.round(n * 100) / 100;
    const x1 = round(cx + r * Math.cos(startRad));
    const y1 = round(cy + r * Math.sin(startRad));
    const x2 = round(cx + r * Math.cos(endRad));
    const y2 = round(cy + r * Math.sin(endRad));
    const sweep = endAngle - startAngle;
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  });

  readonly dialNeedleAngle = computed(() => {
    const sel = this.validTime() || this.time();
    const [h, m] = sel.split(':').map(Number);
    return this.dialAngleForMinutes(h * 60 + m);
  });

  // ─── Calendar navigation ─────────────────────────────────────────────────
  prevMonth(): void {
    let m = this.calendarMonth() - 1;
    let y = this.calendarYear();
    if (m < 0) { m = 11; y--; }
    this.calendarMonth.set(m);
    this.calendarYear.set(y);
  }

  nextMonth(): void {
    let m = this.calendarMonth() + 1;
    let y = this.calendarYear();
    if (m > 11) { m = 0; y++; }
    this.calendarMonth.set(m);
    this.calendarYear.set(y);
  }

  selectDay(day: number): void {
    const y = this.calendarYear();
    const m = this.calendarMonth();
    const cellDate = new Date(y, m, day);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const maxD = new Date();
    if (this.vorausbuchungEinheit() === 'tage') {
      maxD.setDate(maxD.getDate() + this.vorausbuchungWert());
    } else {
      maxD.setMonth(maxD.getMonth() + this.vorausbuchungWert());
    }
    maxD.setHours(23, 59, 59, 999);
    const weekday = (cellDate.getDay() + 6) % 7;
    if (cellDate < todayStart || cellDate > maxD || this.closedWeekdays().includes(weekday)) return;
    const mStr = (m + 1).toString().padStart(2, '0');
    const dStr = day.toString().padStart(2, '0');
    const iso = `${y}-${mStr}-${dStr}`;
    this.date.set(iso);
    // Wenn der aktuell gewählte Raum für dieses Datum gesperrt ist → ersten verfügbaren wählen
    const current = this.selectedVenue();
    if (current && this.isVenueBlockedOn(current, iso)) {
      const available = this.filteredVenues();
      this.selectedVenue.set(available[0] ?? null);
    }
  }

  // ─── Card methods ─────────────────────────────────────────────────────────
  cardTogglePicker(p: 'date' | 'time' | 'seats'): void {
    this.cardOpenPicker.set(this.cardOpenPicker() === p ? null : p);
  }
  cardClosePicker(): void { this.cardOpenPicker.set(null); }
  cardNextStep(): void {
    this.cardClosePicker();
    if (this.tischwahlValid()) {
      this.cardTischwahlError.set(false);
      this.proceedAfterTischwahl();
    } else {
      this.cardTischwahlError.set(true);
    }
  }
  cardGoToSummary(): void {
    if (this.canGoToSummary()) {
      this.cardShowErrors.set(false);
      this.cardWasOnSummary.set(true);
      this.cardStep.set(this.hasExtrasStep() ? 3 : 4);
    } else {
      this.cardShowErrors.set(true);
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>(
          '.preview-card__field--error, .preview-card__consent.is-error'
        );
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }
  /** Von "Extras" (Schritt 3) weiter zur Zusammenfassung — keine Pflichtfelder. */
  cardExtrasNext(): void { this.cardStep.set(4); }
  cardPrevStep(): void {
    this.cardStep.update(s => {
      if (s === 4 && !this.hasExtrasStep()) { return 2; }
      return Math.max(1, s - 1) as 1 | 2 | 3 | 4;
    });
  }
  cardToggleConsent(): void { this.cardConsent.update(v => !v); }
  cardDecSeats(): void { this.people.update(n => Math.max(1, n - 1)); }
  cardIncSeats(): void { this.people.update(n => Math.min(this.maxPeople(), n + 1)); }
  cardSelectDay(day: number): void { this.selectDay(day); this.cardClosePicker(); }
  cardSelectTime(t: string): void { this.time.set(t); this.cardClosePicker(); }
  cardSelectSeats(n: number): void { this.people.set(n); this.cardClosePicker(); }

  // ─── Sidebar methods ──────────────────────────────────────────────────────
  sidebarTogglePicker(p: 'date' | 'time' | 'seats'): void {
    this.sidebarOpenPicker.set(this.sidebarOpenPicker() === p ? null : p);
  }
  sidebarClosePicker(): void { this.sidebarOpenPicker.set(null); }
  sidebarNextStep(): void {
    this.sidebarClosePicker();
    if (this.tischwahlValid()) {
      this.sidebarTischwahlError.set(false);
      this.proceedAfterTischwahl();
    } else {
      this.sidebarTischwahlError.set(true);
    }
  }
  sidebarGoToSummary(): void {
    if (this.canGoToSummary()) {
      this.sidebarShowErrors.set(false);
      this.sidebarWasOnSummary.set(true);
      this.sidebarStep.set(this.hasExtrasStep() ? 3 : 4);
    } else {
      this.sidebarShowErrors.set(true);
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>(
          '.preview-sidebar__group--error, .preview-sidebar__consent.is-error'
        );
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }
  /** Von "Extras" (Schritt 3) weiter zur Zusammenfassung — keine Pflichtfelder. */
  sidebarExtrasNext(): void { this.sidebarStep.set(4); }
  sidebarPrevStep(): void {
    this.sidebarStep.update(s => {
      if (s === 4 && !this.hasExtrasStep()) { return 2; }
      return Math.max(1, s - 1) as 1 | 2 | 3 | 4;
    });
  }
  sidebarToggleConsent(): void { this.sidebarConsent.update(v => !v); }
  sidebarSelectDay(day: number): void { this.selectDay(day); this.sidebarClosePicker(); }
  sidebarSelectTime(t: string): void { this.time.set(t); this.sidebarClosePicker(); }
  sidebarSelectSeats(n: number): void { this.people.set(n); this.sidebarClosePicker(); }

  // ─── Stacked methods ──────────────────────────────────────────────────────
  stackedTogglePicker(p: 'date' | 'time' | 'seats'): void {
    this.stackedOpenPicker.set(this.stackedOpenPicker() === p ? null : p);
  }
  stackedClosePicker(): void { this.stackedOpenPicker.set(null); }
  stackedNextStep(): void {
    this.stackedClosePicker();
    if (this.tischwahlValid()) {
      this.stackedTischwahlError.set(false);
      this.proceedAfterTischwahl();
    } else {
      this.stackedTischwahlError.set(true);
    }
  }
  stackedGoToSummary(): void {
    if (this.canGoToSummary()) {
      this.stackedShowErrors.set(false);
      this.stackedWasOnSummary.set(true);
      this.stackedStep.set(this.hasExtrasStep() ? 3 : 4);
    } else {
      this.stackedShowErrors.set(true);
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>('.preview-stacked__field--error input, .preview-stacked__consent.is-error');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }
  /** Von "Extras" (Schritt 3) weiter zur Zusammenfassung — keine Pflichtfelder. */
  stackedExtrasNext(): void { this.stackedStep.set(4); }
  stackedPrevStep(): void {
    if (this.stackedStep() === 4) { this.stackedWasOnSummary.set(true); }
    this.stackedStep.update(s => {
      if (s === 4 && !this.hasExtrasStep()) { return 2; }
      return Math.max(1, s - 1) as 1 | 2 | 3 | 4;
    });
  }
  stackedToggleConsent(): void { this.stackedConsent.update(v => !v); }
  stackedSelectDay(day: number): void { this.selectDay(day); this.stackedClosePicker(); }
  stackedSelectTime(t: string): void { this.time.set(t); this.stackedClosePicker(); }
  stackedSelectSeats(n: number): void { this.people.set(n); this.stackedClosePicker(); }

  // ─── Tischarten ──────────────────────────────────────────────────────────
  readonly alleTischarten = [
    { key: 'round',  label: 'Runder Tisch',     icon: '⭕' },
    { key: 'square', label: 'Viereckiger Tisch', icon: '⬛' },
    { key: 'long',   label: 'Langer Tisch',      icon: '▬'  },
  ];

  readonly availableTischarten = computed(() => {
    const activeTypes  = this.tischartenAktiveTypes();
    const venueTypes   = new Set<string>(this.venueTables().map(t => t.type));
    return this.alleTischarten.filter(t => activeTypes.includes(t.key) && venueTypes.has(t.key));
  });

  readonly venueTables = computed<WidgetVenueTable[]>(() =>
    this.selectedVenue()?.tables ?? []
  );

  readonly venueWalls = computed<WidgetVenueWall[]>(() =>
    this.selectedVenue()?.walls ?? []
  );

  readonly venueDecors = computed<WidgetVenueDecor[]>(() =>
    this.selectedVenue()?.decors ?? []
  );

  /**
   * Berechnet die passende Breite einer Textfeld-Box (Dekor-Typ 'label') für
   * einen gegebenen Text. Misst die tatsächliche Pixel-Breite (600/11px
   * sans-serif, identisch zur Anzeige in Editor, Tischplan und Widget) statt
   * grob über die Zeichenanzahl zu schätzen — dadurch kein unnötiger
   * Leerraum mehr links/rechts. Untergrenze 120px (Platzhalter-Breite),
   * Obergrenze 360px – identisch zur Admin-Logik in room.types.ts, damit
   * Editor und Gast-Ansicht übereinstimmen.
   */
  getLabelWidth(text?: string): number {
    const t = (text ?? '').trim();
    if (!t) return 120;
    const ctx = getLabelMeasureCtx();
    let textWidth: number;
    if (ctx) {
      ctx.font = '600 11px sans-serif';
      textWidth = ctx.measureText(t).width;
    } else {
      textWidth = t.length * 6.5; // Fallback ohne Canvas-Kontext (z. B. SSR)
    }
    const estimated = Math.round(textWidth + 24); // Rand + minimaler Innenabstand
    return Math.min(360, Math.max(120, estimated));
  }

  readonly availableTables = computed<WidgetVenueTable[]>(() => {
    const booked   = this.availability()?.bookedTableNumbers  ?? [];
    const blocked  = this.availability()?.blockedTableNumbers ?? [];
    return this.venueTables().filter(t => !booked.includes(t.id) && !blocked.includes(t.id));
  });

  readonly blockedTableIds = computed<number[]>(() =>
    this.availability()?.blockedTableNumbers ?? []
  );

  // Tische die zur Personenzahl passen (für Vollbild-Overlay).
  // Zeigt nur die kleinste passende Tischgröße (engste Passung).
  // Fallback auf nächstgrößere Stufe wenn die engste Passung vergriffen ist.
  readonly suitableTables = computed<WidgetVenueTable[]>(() => {
    const all    = this.availableTables();
    const needed = this.people();

    // Alle Tische die groß genug sind, aufsteigend nach Sitzplätzen.
    const fitting = all.filter(t => t.seats >= needed).sort((a, b) => a.seats - b.seats);

    // Kein Tisch passt → leeres Array (keine Selbstauswahl anzeigen).
    if (fitting.length === 0) return [];

    // Engste Passung: nur die kleinste Tischgröße die noch ausreicht.
    // Größere Tische bleiben für Gruppen die sie wirklich brauchen reserviert.
    const minSeats = fitting[0].seats;
    return fitting.filter(t => t.seats === minSeats);
  });

  // How many tables are dimmed (not suitable for the selected party size)
  readonly hiddenTableCount = computed<number>(() => {
    return this.venueTables().length - this.suitableTables().length;
  });

  readonly planViewBox = computed<string>(() => {
    const tables = this.venueTables();
    const walls  = this.venueWalls();
    const decors = this.venueDecors();
    if (!tables.length && !walls.length && !decors.length) return '0 0 800 500';
    const pad = 40;
    const pts: { minX: number; minY: number; maxX: number; maxY: number }[] = [];

    tables.forEach(t => {
      const w = t.type === 'long' ? 140 * t.scale : 70 * t.scale;
      const h = 70 * t.scale;
      pts.push({ minX: t.x - pad, minY: t.y - pad, maxX: t.x + w + pad, maxY: t.y + h + pad });
    });

    walls.forEach(w => {
      // Wall is centered at (w.x, w.y) with half-length in each direction
      const half = w.length / 2;
      pts.push({ minX: w.x - half - pad, minY: w.y - 12 - pad, maxX: w.x + half + pad, maxY: w.y + 12 + pad });
    });

    decors.forEach(d => {
      const isWide = ['bar', 'stage', 'sofa'].includes(d.type);
      const isWindow = d.type === 'window';
      const isLabel = d.type === 'label';
      const baseW = (isWide || isWindow) ? 140 : (isLabel ? 120 : 70);
      const baseH = isWindow ? 32 : (isLabel ? 40 : 70);
      const w = baseW * d.scale;
      const h = baseH * d.scale;
      pts.push({ minX: d.x - pad, minY: d.y - pad, maxX: d.x + w + pad, maxY: d.y + h + pad });
    });

    const minX = Math.min(...pts.map(p => p.minX));
    const minY = Math.min(...pts.map(p => p.minY));
    const maxX = Math.max(...pts.map(p => p.maxX));
    const maxY = Math.max(...pts.map(p => p.maxY));
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  });

  selectTable(id: number): void {
    this.selectedTableId.set(this.selectedTableId() === id ? null : id);
  }

  // ─── Kinderstühle helpers ─────────────────────────────────────────────────
  incKinderStuehle(): void { this.kinderStuehle.update(n => Math.min(this.kinderStuehleOnline(), n + 1)); }
  decKinderStuehle(): void { this.kinderStuehle.update(n => Math.max(0, n - 1)); }

  // ─── Minuten formatieren ──────────────────────────────────────────────────
  formatMinutenPolicy(min: number): string {
    if (min < 60) return `${min} Min.`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h} Std.` : `${h} Std. ${m} Min.`;
  }

  // ─── Planner methods ──────────────────────────────────────────────────────
  private plannerAdvanceTo(s: 1 | 2 | 3 | 4 | 5): void {
    this.plannerStep.set(s);
    if (s > this.plannerMaxStep()) this.plannerMaxStep.set(s);
  }
  setPlannerStep(s: 1 | 2 | 3 | 4 | 5): void { this.plannerAdvanceTo(s); }
  plannerPrev(): void {
    // Im Minuten-Modus: erst zurück zur Stunden-Auswahl
    if (this.plannerStep() === 2 && this.plannerDialPhase() === 'minute') {
      this.plannerDialPhase.set('hour');
      return;
    }
    if (this.plannerStep() === 5) { this.plannerWasOnSummary.set(true); }
    const s = this.plannerStep();
    if (s > 1) this.plannerStep.set((s - 1) as 1 | 2 | 3 | 4 | 5);
    // plannerMaxStep bleibt, damit Vorwärts-Pfeil erhalten bleibt
  }
  plannerNext(): void {
    const s = this.plannerStep();
    if (s === 4) {
      if (this.canGoToSummary()) {
        this.plannerShowErrors.set(false);
        this.plannerWasOnSummary.set(true);
        this.plannerAdvanceTo(5);
      } else {
        this.plannerShowErrors.set(true);
        setTimeout(() => {
          const el = document.querySelector<HTMLElement>('.preview-planner__form-group--error input, .preview-planner__consent.is-error');
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
      }
      return;
    }
    // Schritte 1–3 (Datum/Uhrzeit/Personen): Datum, Uhrzeit und Personenzahl
    // sind praktisch immer schon sinnvoll vorbelegt (Standardwerte). Wenn der
    // Nutzer also z.B. direkt auf Schritt 1 auf "Weiter" klickt, ohne jedes
    // Panel einzeln anzufassen, soll trotzdem direkt zu Schritt 4 (Kontakt)
    // gesprungen werden, statt ihn Schritt für Schritt durch 1→2→3 zu
    // schicken, obwohl an den (bereits gültigen) Werten nichts zu tun ist.
    // Nur wenn die aktuelle Auswahl (noch) nicht gültig ist (z.B. geschlossener
    // Tag, keine Slots mehr frei), bleiben wir bewusst auf dem aktuellen Panel
    // und zeigen einen Hinweis, statt den Gast blind weiterzuschicken — das
    // Problem sitzt ja genau hier (Datum/Uhrzeit/Personen) und nicht im
    // nächsten Schritt.
    if (s < 4) {
      if (this.tischwahlValid()) {
        this.plannerTischwahlError.set(false);
        this.proceedAfterTischwahl();
      } else {
        this.plannerTischwahlError.set(true);
      }
      return;
    }
  }
  /** Kleiner Vorwärts-Pfeil in der Topbar (nur sichtbar, wenn man zu einem
   *  bereits besuchten Schritt zurückgegangen ist, siehe plannerMaxStep()).
   *  Blättert bewusst nur EINEN Schritt weiter — anders als die "Weiter"-CTA
   *  (plannerNext()), die bei gültigen Werten direkt zu Schritt 4 springt.
   *  Ohne diese Trennung würde der Pfeil z.B. beim Review von Schritt 2 aus
   *  versehentlich Schritt 3 (Personen) überspringen. */
  plannerStepForward(): void {
    const s = this.plannerStep();
    if (s < this.plannerMaxStep() && s < 5) {
      this.plannerAdvanceTo((s + 1) as 1 | 2 | 3 | 4 | 5);
    }
  }
  plannerToggleConsent(): void { this.plannerConsent.update(v => !v); }
  selectPlannerDay(day: number): void { this.selectDay(day); this.plannerAdvanceTo(2); }
  selectPlannerTime(t: string): void { this.time.set(t); this.plannerAdvanceTo(3); }

  /** Phase 1: Stunde wählen → wechselt zu Minuten-Phase (oder direkt zu Schritt 3 bei 60-Min-Intervall). */
  selectPlannerHour(hour: number): void {
    const slots = this.timeSlots();
    const match = slots.find(s => parseInt(s.split(':')[0], 10) === hour);
    if (!match) return;
    this.time.set(match);
    if (this.dialIntervalMinutes() >= 60) {
      this.plannerDialPhase.set('hour');
      this.setPlannerStep(3);
    } else {
      this.plannerDialPhase.set('minute');
    }
  }

  /** Phase 2: Minute wählen → setzt die Uhrzeit und wechselt zu Schritt 3. */
  selectPlannerMinute(minute: number): void {
    const pad = (n: number) => String(n).padStart(2, '0');
    const [h] = this.validTime().split(':').map(Number);
    const t = `${pad(h)}:${pad(minute)}`;
    if (this.timeSlots().includes(t)) this.time.set(t);
    this.plannerDialPhase.set('hour');
    this.setPlannerStep(3);
  }
  /** Setzt nur die Personenzahl — springt bewusst NICHT automatisch weiter
   *  zu Schritt 4, damit man danach noch Datum/Uhrzeit nachjustieren kann,
   *  ohne erst wieder zurückblättern zu müssen. Der Sprung zu Schritt 4
   *  passiert ausschließlich über den expliziten "Weiter"-Klick
   *  (siehe plannerNext()). */
  selectPlannerSeats(n: number): void {
    this.people.set(n);
  }

  // ─── Tischwahl-Präferenz (Zwischenschritt NACH Datum/Uhrzeit/Personenzahl,
  //     siehe needsTischwahlPick()) ─────────────────────────────────────────
  chooseTischwahlAuto(): void {
    this.selectedTableId.set(null);
    this.tischwahlChoice.set('auto');
    this.advanceToContactStep();
  }

  /**
   * Bei "selbst wählen" öffnet sich der Tischplan, NACHDEM Datum/Uhrzeit/
   * Personenzahl bereits feststehen (siehe needsTischwahlPick()). Dadurch
   * markiert die Passend-Prüfung im Plan (suitableTables()) von Anfang an
   * die Tische korrekt gegen die echte Personenzahl — vorher öffnete sich
   * der Plan sofort nach der Präferenzwahl, noch bevor die Personenzahl
   * bekannt war, wodurch z.B. nur 4er-Tische markiert wirkten, obwohl der
   * Gast später 9 Personen einträgt und am Ende unerwartet auf der
   * Warteliste landete.
   */
  chooseTischwahlSelbst(): void {
    this.tischwahlChoice.set('selbst');
    this.tischplanOverlayOpen.set(true);
    this.advanceToContactStep();
  }

  /** Zurück von der Tischwahl-Präferenz zu Datum/Uhrzeit/Personenzahl (Schritt 1) —
   *  setzt hasPassedInitialDateTime zurück, wodurch needsTischwahlPick() wieder
   *  false wird und das Formular erneut sichtbar wird. */
  backFromTischwahlPick(): void {
    this.hasPassedInitialDateTime.set(false);
  }

  /** Rückt in allen 4 Layouts vom Datum/Uhrzeit/Personenzahl-Formular (bzw. der
   *  Tischwahl-Präferenz) zum Kontakt-Schritt vor. Gemeinsam genutzt von
   *  proceedAfterTischwahl() (Auto-Fall ohne aktive Tisch-Planauswahl) sowie
   *  chooseTischwahlAuto()/chooseTischwahlSelbst() (nachdem die Präferenz
   *  feststeht). */
  private advanceToContactStep(): void {
    switch (this.layout()) {
      case 'card':    this.cardStep.set(2);     break;
      case 'sidebar': this.sidebarStep.set(2);  break;
      case 'stacked': this.stackedStep.set(2);  break;
      case 'planner': this.setPlannerStep(4);   break;
    }
  }

  // ─── Tischplan-Zwischenschritt-Methoden ───────────────────────────────────
  /**
   * Schließt den Tischplan und bestätigt die Auswahl. Ein erzwungener
   * Schritt-Wechsel ist nicht nötig: Der Schritt wurde bereits beim Öffnen
   * (chooseTischwahlSelbst()) auf den Kontakt-Schritt vorgerückt, das
   * dahinterliegende Kontakt-Formular kommt also von selbst zum Vorschein.
   * Wird der Plan später erneut geöffnet (Button "Tisch ändern" während der
   * Gastdaten-Erfassung), bleibt der aktuelle Schritt ohnehin unverändert.
   */
  tischplanOverlayConfirm(): void {
    this.tischplanOverlayOpen.set(false);
  }

  /**
   * Zurück aus dem Tischplan. Wurde noch gar kein Tisch angeklickt (erster
   * Aufruf direkt nach "selbst wählen", noch nichts ausgewählt), heißt
   * "Zurück" so viel wie "Auswahl abbrechen" — dann geht es zurück zur
   * Auto/Selbst-Präferenz. Wurde bereits ein Tisch gewählt (auch beim
   * späteren "Tisch ändern"), bleibt die Auswahl erhalten und es wird nur
   * der Plan geschlossen.
   */
  tischplanOverlayBack(): void {
    this.tischplanOverlayOpen.set(false);
    if (this.selectedTableId() === null) {
      this.tischwahlChoice.set(null);
    }
  }

  // Raumwechsel direkt im Tischplan-Overlay — nur relevant, wenn die
  // Raumauswahl-Einstellung AUS ist (sonst wurde der Raum schon vorher über
  // needsVenuePick() fest gewählt). Setzt die Tischauswahl zurück, da sich
  // mit dem Raum auch der Grundriss/die freien Tische ändern.
  selectVenueInPlan(venue: WidgetVenue): void {
    this.selectedVenue.set(venue);
    this.selectedTableId.set(null);
  }

  private proceedAfterTischwahl(): void {
    this.hasPassedInitialDateTime.set(true);
    if (this.needsTischwahlPick()) {
      // Tisch-Plan-Auswahl aktiv, aber noch keine Präferenz (auto/selbst)
      // gewählt — needsTischwahlPick() zeigt jetzt (siehe @else-if-Kette in
      // den Templates) den Zwischenschritt, bevor es zum Kontakt-Formular
      // weitergeht. advanceToContactStep() wird erst in chooseTischwahlAuto()/
      // chooseTischwahlSelbst() aufgerufen, sobald die Präferenz feststeht.
      return;
    }
    this.advanceToContactStep();
  }

  ngOnInit(): void {
    const publicKey = this.route.snapshot.queryParamMap.get('key') ?? environment.publicKey;

    if (!publicKey) {
      this.state.set('error');
      this.errorMessage.set('Kein Public Key angegeben. Bitte Widget-URL mit ?key=DEIN_KEY aufrufen.');
      return;
    }

    // Rückkehr von PayPal-Redirect erkennen (Stripe fügt redirect_status zur URL hinzu)
    const redirectStatus = this.route.snapshot.queryParamMap.get('redirect_status');
    if (redirectStatus === 'succeeded') {
      this.state.set('success');
      return;
    }
    if (redirectStatus === 'requires_payment_method') {
      this.loadConfig(publicKey);
      this.state.set('payment');
      this.paymentError.set('Zahlung fehlgeschlagen. Bitte eine andere Zahlungsmethode wählen.');
      return;
    }

    this.loadConfig(publicKey);

    // Config neu laden wenn der Tab sichtbar wird (Tab-Wechsel) ODER
    // das Fenster den Fokus bekommt (z.B. Admin-Tab → Widget-Tab click).
    // Nur wenn kein Buchungsvorgang läuft. preserveSelection=true, damit eine
    // bereits getroffene Auswahl (Datum/Raum/Tisch) durch den Reload NICHT
    // überschrieben wird — state() bleibt während der ganzen Buchungsstrecke
    // 'idle', ein Gast der z.B. kurz den Tab wechselt würde sonst seine
    // Auswahl verlieren.
    const reloadIfIdle = () => {
      if (this.state() === 'idle') this.loadConfig(publicKey, true);
    };
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reloadIfIdle();
    });
    window.addEventListener('focus', reloadIfIdle);

    // Fensterbreite für Tablet-Erkennung tracken
    window.addEventListener('resize', () => this.windowWidth.set(window.innerWidth));
  }

  /**
   * @param preserveSelection true bei einem Reload im Hintergrund (Tab-Refocus)
   *   — dann werden Datum/Raum-Vorbelegung NICHT angefasst, damit eine bereits
   *   getroffene Gast-Auswahl erhalten bleibt. Der ausgewählte Raum wird
   *   lediglich mit den frischen Daten (z.B. geänderter Tischplan) abgeglichen.
   */
  private loadConfig(publicKey: string, preserveSelection = false): void {
    this.reservations.loadConfig(publicKey).subscribe(config => {
      this.restaurantName.set(config.name);
      this.venues.set(config.venues);
      // Sprache setzen bevor applyDesign (headingTitle-Default kann davon abhängen)
      if (config.widgetLanguage) this.i18n.setLang(config.widgetLanguage);
      this.applyDesign(config.widgetDesign);
      this.applyFunctional(config.widgetFunctional);
      if (Array.isArray(config.allergene)) this.verfuegbareAllergene.set(config.allergene);
      if (Array.isArray(config.packages)) this.verfuegbarePackages.set(config.packages);
      this.stripePublishableKey.set(config.stripePublishableKey ?? null);

      const closed = config.closedWeekdays ?? [];
      this.closedWeekdays.set(closed);

      const specialRanges = config.specialClosedRanges ?? [];
      this.specialClosedRanges.set(specialRanges);

      const schedule = config.openingSchedule ?? {};
      this.openingSchedule.set(schedule);

      // Find the first selectable day: not a closed weekday, not a special closing,
      // and still has at least one bookable time slot left.
      // Nur bei Erstladung — bei preserveSelection (Tab-Refocus-Reload) soll
      // das vom Gast bereits gewählte Datum unangetastet bleiben.
      if (!preserveSelection) {
        const now        = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const step       = this.stepMinutes();
        const minLead    = this.mindestvorlaufMinuten();

        const hasSlots = (wd: number, isToday: boolean): boolean => {
          const sched    = schedule[wd];
          const openStr  = sched?.open_time  ?? DEFAULT_FROM;
          const closeStr = sched?.close_time ?? DEFAULT_TO;
          const [oh, om] = openStr.split(':').map(Number);
          const [ch, cm] = closeStr.split(':').map(Number);
          const openMin  = oh * 60 + om;
          const closeMin = ch * 60 + cm;
          const cutoff   = isToday ? nowMinutes + minLead : openMin;
          let   cur      = openMin;
          while (cur < closeMin && cur < cutoff) cur += step;
          return cur < closeMin;
        };

        let d = new Date(this.today + 'T00:00:00');
        for (let i = 0; i < 60; i++) {
          const wd = (d.getDay() + 6) % 7;
          const ds = StartComponent.localDate(d);
          const isToday = ds === this.today;
          const isSpecialClosed = specialRanges.some(r => ds >= r.date_from && ds <= r.date_to);
          if (closed.includes(wd) || isSpecialClosed) { d.setDate(d.getDate() + 1); continue; }
          if (!hasSlots(wd, isToday))                 { d.setDate(d.getDate() + 1); continue; }
          break;
        }
        const iso = StartComponent.localDate(d);
        if (iso !== this.date()) {
          this.date.set(iso);
          this.calendarMonth.set(d.getMonth());
          this.calendarYear.set(d.getFullYear());
        }
      }

      const filtered = this.filteredVenues();
      if (!preserveSelection) {
        // Ist die Raumauswahl aktiv und gibt es mehrere Räume: KEINEN Raum
        // vorbelegen — der Gast muss den Raum zuerst wählen (siehe
        // needsVenuePick()), damit Datum & Uhrzeit direkt mit der echten
        // Verfügbarkeit dieses Raums berechnet werden. Sonst (nur 1 Raum /
        // Raumauswahl deaktiviert) sofort vorbelegen, damit die Verfügbarkeits-
        // prüfung ohne zusätzlichen Klick greift.
        if (filtered.length > 0 && !(this.raumauswahl() && filtered.length > 1)) {
          this.selectedVenue.set(filtered[0]);
        }
      } else {
        // Bereits gewählten Raum mit den frischen Daten abgleichen (z.B. falls
        // der Admin währenddessen den Tischplan geändert hat), ohne die
        // Auswahl selbst zu verwerfen.
        const current = this.selectedVenue();
        if (current) {
          const fresh = filtered.find(v => v.id === current.id);
          if (fresh) this.selectedVenue.set(fresh);
        }
      }

      this.state.set(filtered.length > 0 ? 'idle' : 'error');
      if (filtered.length === 0) {
        this.errorMessage.set('Keine buchbaren Räume gefunden.');
      }
    });
  }

  private applyDesign(design: WidgetDesignConfig | null | undefined): void {
    if (!design) return;

    const fontMap: Record<string, string> = {
      system:  `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
      modern:  `"Trebuchet MS", "Lucida Sans Unicode", "Lucida Grande", sans-serif`,
      classic: `"Helvetica Neue", Helvetica, Arial, sans-serif`,
      serif:   `Georgia, "Times New Roman", Times, serif`,
      rounded: `"Avenir Next", "Avenir", "Nunito", sans-serif`,
      mono:    `"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace`,
    };

    const sizeMap: Record<string, string> = {
      compact:  '12px',
      standard: '14px',
      large:    '16px',
    };

    const radiusMap: Record<string, number> = {
      square: 4,
      soft:   10,
      pill:   999,
    };

    const root = document.documentElement;

    const fontStack = fontMap[design.fontFamily];
    const fontSize  = sizeMap[design.fontSize];
    const radiusPx  = radiusMap[design.cornerRadius];

    // Kachel-Hintergrund (fällt auf colorBackground zurück wenn nicht gesetzt).
    // Das ist die tatsächliche, im Designer editierbare Oberfläche des
    // Widgets ("Widget-Kachel") – im Gegensatz zum älteren `colorBackground`,
    // das im Designer kein eigenes Eingabefeld mehr hat und daher als reine
    // Kontrast-Referenz veraltet/falsch sein kann.
    const cardBg = design.cardBackground ?? design.colorBackground ?? '#ffffff';

    // Frei wählbare Textfarbe gegen die tatsächliche Kachel-Oberfläche
    // absichern, damit Text/Icons/Rahmen (z. B. im Tischwahl-Dialog) nicht
    // unsichtbar werden, wenn Textfarbe und Kachel-Hintergrund zu ähnlich sind.
    const safeCardText = this.ensureReadableText(cardBg, design.colorText ?? '#1f2937');

    // Legacy --w-* variables (keep for backward compat)
    if (design.colorPrimary) {
      root.style.setProperty('--w-color-primary', design.colorPrimary);
      const rgb = this.hexToRgbString(design.colorPrimary);
      if (rgb) root.style.setProperty('--w-color-primary-rgb', rgb);
      root.style.setProperty('--w-color-primary-dark', this.darkenHex(design.colorPrimary, 20));
    }
    root.style.setProperty('--w-color-text', safeCardText);
    root.style.setProperty('--w-color-bg', cardBg);
    root.style.setProperty('--w-color-surface', cardBg);
    if (fontStack) root.style.setProperty('--w-font', fontStack);
    if (fontSize)  root.style.setProperty('font-size', fontSize);
    if (radiusPx !== undefined) {
      root.style.setProperty('--w-radius',    `${radiusPx}px`);
      root.style.setProperty('--w-radius-sm', `${Math.max(4, Math.round(radiusPx * 0.7))}px`);
    }

    // --preview-* variables for the layout components.
    // --preview-bg wurde früher direkt aus dem veralteten `colorBackground`-
    // Feld gesetzt (kein eigenes Eingabefeld im Designer mehr, blieb also oft
    // auf Weiß eingefroren). Dutzende Komponenten (Buttons, Karten, Dialoge –
    // inkl. Tischwahl-Dialog) verwenden --preview-bg aber als "die" Oberfläche
    // des Widgets. Deshalb hier konsequent an cardBg koppeln, damit Hinter-
    // grund und die dagegen berechneten Text-/Rahmenfarben immer zusammenpassen.
    if (design.colorPrimary) root.style.setProperty('--preview-primary', design.colorPrimary);
    root.style.setProperty('--preview-text', safeCardText);
    root.style.setProperty('--preview-bg', cardBg);
    root.style.setProperty('--preview-card-bg', cardBg);

    // Seiten-Hintergrund auf body anwenden
    // Layout-spezifisches Hintergrundbild überschreibt pageBackground wenn gesetzt
    const body = document.body;
    const html = document.documentElement;
    const layoutBgImage =
      design.layout === 'card'    ? (design.cardBackgroundImage    ?? null) :
      design.layout === 'stacked' ? (design.stackedBackgroundImage ?? null) :
      design.layout === 'planner' ? (design.plannerBackgroundImage ?? null) :
      null;
    const pb = design.pageBackground;
    if (layoutBgImage) {
      body.style.background = `url(${layoutBgImage}) center/cover no-repeat fixed`;
      html.style.background = `url(${layoutBgImage}) center/cover no-repeat fixed`;
    } else if (pb) {
      if (pb.type === 'image' && pb.value) {
        body.style.background = `url(${pb.value}) center/cover no-repeat fixed`;
        html.style.background = `url(${pb.value}) center/cover no-repeat fixed`;
      } else if (pb.type === 'color' && pb.gradient && pb.gradientColor2) {
        const grad = `linear-gradient(135deg, ${pb.value}, ${pb.gradientColor2})`;
        body.style.background = grad;
        html.style.background = grad;
      } else if (pb.type === 'color' && pb.value) {
        body.style.background = pb.value;
        html.style.background = pb.value;
      }
    }

    // isDark bewusst gegen cardBg (die tatsächliche Oberfläche, auf der Text,
    // Rahmen und Buttons liegen) bestimmen, nicht gegen das veraltete
    // `colorBackground` – sonst werden --preview-muted/-border/-soft falsch
    // berechnet, sobald die Kachel dunkel, das alte Feld aber (mangels
    // eigenem Eingabefeld im Designer) noch hell eingefroren ist.
    const isDark = this.isDarkBackground(cardBg);
    root.style.setProperty('--preview-muted',  isDark
      ? 'rgba(255,255,255,0.6)'
      : 'color-mix(in srgb, var(--preview-text) 52%, transparent)');
    root.style.setProperty('--preview-border', isDark ? 'rgba(255,255,255,0.14)' : 'color-mix(in srgb, var(--preview-text) 14%, transparent)');
    root.style.setProperty('--preview-soft',   isDark ? 'rgba(255,255,255,0.06)' : 'color-mix(in srgb, var(--preview-text) 4%, transparent)');

    if (fontStack) root.style.setProperty('--preview-font', fontStack);
    if (fontSize)  root.style.setProperty('--preview-base', fontSize);
    const capped = Math.min(radiusPx ?? 10, 14);
    root.style.setProperty('--preview-radius',     `${capped}px`);
    root.style.setProperty('--preview-radius-cta', `${radiusPx ?? 10}px`);

    // Signal assignments
    if (design.layout)           this.layout.set(design.layout);
    if (design.imageUrl !== undefined) this.imageUrl.set(design.imageUrl);
    if (design.cardBackgroundImage    !== undefined) this.cardBackgroundImage.set(design.cardBackgroundImage ?? null);
    if (design.stackedBackgroundImage !== undefined) this.stackedBackgroundImage.set(design.stackedBackgroundImage ?? null);
    if (design.plannerBackgroundImage !== undefined) this.plannerBackgroundImage.set(design.plannerBackgroundImage ?? null);
    if (design.headingAlignment) this.headingAlignment.set(design.headingAlignment);
    // Wenn kein Custom-Wert, den i18n-Default verwenden
    this.headingTitle.set(design.headingTitle || this.i18n.t().bookingTitle);
    if (design.headingSubtitle !== undefined) this.headingSubtitle.set(design.headingSubtitle ?? '');
    this.buttonLabel.set(design.buttonLabel || this.i18n.t().submitLabel);
    if (typeof design.showSubtitle === 'boolean') this.showSubtitle.set(design.showSubtitle);
  }

  private applyFunctional(func: WidgetFunctionalConfig | null | undefined): void {
    if (!func) return;
    if (typeof func.intervall === 'number')           this.stepMinutes.set(func.intervall);
    if (typeof func.maxPersonen === 'number')          this.maxPeople.set(func.maxPersonen);
    if (Array.isArray(func.pflichtfelder))             this.requiredFields.set(func.pflichtfelder);
    if (typeof func.speisekarte === 'boolean')         this.speisekarte.set(func.speisekarte);
    if (func.speisekarteType)                          this.speisekarteType.set(func.speisekarteType);
    if (func.speisekarteUrl != null)                   this.speisekarteUrl.set(func.speisekarteUrl);
    if (func.speisekartePdfName != null)               this.speisekartePdfName.set(func.speisekartePdfName);
    if (typeof func.hinweistext === 'boolean') {
      this.hinweistext.set(func.hinweistext);
      if (func.hinweistext) {
        const dismissed = localStorage.getItem('widget.hinweis.dismissed');
        const recentlyDismissed = !!dismissed && (Date.now() - parseInt(dismissed, 10)) < 24 * 60 * 60 * 1000;
        if (!recentlyDismissed) this.hinweisOpen.set(true);
      }
    }
    if (func.hinweistextUeberschrift != null)          this.hinweistextUeberschrift.set(func.hinweistextUeberschrift);
    if (func.hinweistextInhalt != null)                this.hinweistextInhalt.set(func.hinweistextInhalt);
    if (func.hinweistextFooter != null)                this.hinweistextFooter.set(func.hinweistextFooter);
    if (func.maxPersonenText != null)                  this.maxPersonenText.set(func.maxPersonenText);
    if (func.maxPersonenPhone != null)                 this.maxPersonenPhone.set(func.maxPersonenPhone);
    if (func.maxPersonenEmail != null)                 this.maxPersonenEmail.set(func.maxPersonenEmail);
    if (typeof func.raumauswahl === 'boolean')         this.raumauswahl.set(func.raumauswahl);
    if (Array.isArray(func.raumauswahlAktiveIds))      this.raumauswahlAktiveIds.set(func.raumauswahlAktiveIds);
    if (typeof func.kinderStuehleAktiv === 'boolean')  this.kinderStuehleAktiv.set(func.kinderStuehleAktiv);
    if (typeof func.kinderStuehleOnline === 'number')  this.kinderStuehleOnline.set(func.kinderStuehleOnline);
    if (typeof func.rollstuhlAktiv === 'boolean')      this.rollstuhlAktiv.set(func.rollstuhlAktiv);
    if (typeof func.hundAktiv === 'boolean')           this.hundAktiv.set(func.hundAktiv);
    if (typeof func.allergeneAktiv === 'boolean')      this.allergeneAktiv.set(func.allergeneAktiv);
    if (typeof func.packageBuchung === 'boolean')      this.packageBuchungAktiv.set(func.packageBuchung);
    if (func.vorausbuchungEinheit)                     this.vorausbuchungEinheit.set(func.vorausbuchungEinheit);
    if (typeof func.vorausbuchungWert === 'number')    this.vorausbuchungWert.set(func.vorausbuchungWert);
    if (typeof func.mindestvorlaufMinuten === 'number')  this.mindestvorlaufMinuten.set(func.mindestvorlaufMinuten);
    if (typeof func.defaultDurationMinutes === 'number') this.defaultDurationMinutes.set(func.defaultDurationMinutes);
    if (typeof func.cleanupMinutes === 'number')       this.cleanupMinutes.set(func.cleanupMinutes);
    if (typeof func.tischartenAktiv === 'boolean')     this.tischartenAktiv.set(func.tischartenAktiv);
    if (Array.isArray(func.tischartenAktiveTypes))     this.tischartenAktiveTypes.set(func.tischartenAktiveTypes);
    if (func.tischartenAuswahlModus)                   this.tischartenModus.set(func.tischartenAuswahlModus);
    if (typeof func.onlineAenderungen === 'boolean')   this.onlineAenderungen.set(func.onlineAenderungen);
    if (typeof func.onlineAenderungenMinuten === 'number') this.onlineAenderungenMinuten.set(func.onlineAenderungenMinuten);
    if (typeof func.onlineStornierung === 'boolean')   this.onlineStornierung.set(func.onlineStornierung);
    if (typeof func.onlineStornierungMinuten === 'number') this.onlineStornierungMinuten.set(func.onlineStornierungMinuten);
    if (typeof func.zahlungAktiv === 'boolean')        this.zahlungAktiv.set(func.zahlungAktiv);
    if (typeof func.zahlungPflicht === 'boolean')      this.zahlungPflicht.set(func.zahlungPflicht);
    if (typeof func.noShowSchutzAktiv === 'boolean')   this.noShowSchutzAktiv.set(func.noShowSchutzAktiv);
    this.noShowWidgetText.set(func.noShowWidgetText || this.i18n.t().noShowNotice);
    if (Array.isArray(func.venueReihenfolge))          this.venueReihenfolge.set(func.venueReihenfolge);
    if (typeof func.wartelisteAktiv === 'boolean')       this.wartelisteAktiv.set(func.wartelisteAktiv);
    if (typeof func.wartelisteMaxPlaetze === 'number')   this.wartelisteMaxPlaetze.set(func.wartelisteMaxPlaetze);
    if (func.wartelisteKanal)                            this.wartelisteKanal.set(func.wartelisteKanal);
    if (typeof func.wartelisteAntwortStunden === 'number') this.wartelisteAntwortStunden.set(func.wartelisteAntwortStunden);
    if (func.wartelisteHinweis != null)                    this.wartelisteHinweis.set(func.wartelisteHinweis);
  }

  private isDarkBackground(hex: string): boolean {
    const h = hex.replace('#', '');
    if (h.length !== 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) / 255 < 0.5;
  }

  /** WCAG relative luminance (0 = schwarz, 1 = weiß). */
  private relativeLuminance(hex: string): number {
    const h = hex.replace('#', '');
    if (h.length !== 6) return 1;
    const chan = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const r = chan(parseInt(h.slice(0, 2), 16));
    const g = chan(parseInt(h.slice(2, 4), 16));
    const b = chan(parseInt(h.slice(4, 6), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /** WCAG-Kontrastverhältnis zweier Hex-Farben (1 = kein Kontrast, 21 = max). */
  private contrastRatio(hexA: string, hexB: string): number {
    const lA = this.relativeLuminance(hexA);
    const lB = this.relativeLuminance(hexB);
    const lighter = Math.max(lA, lB);
    const darker = Math.min(lA, lB);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Liefert `fgHex`, sofern es ausreichend Kontrast zu `bgHex` hat – sonst
   * Schwarz/Weiß (je nachdem was besser lesbar ist). Verhindert, dass Text
   * oder Grafik-Elemente unsichtbar werden, wenn im Widget-Designer Text-
   * und Hintergrundfarbe versehentlich zu ähnlich gewählt werden.
   */
  private ensureReadableText(bgHex: string, fgHex: string, minRatio = 3): string {
    if (!/^#[0-9a-fA-F]{6}$/.test(bgHex) || !/^#[0-9a-fA-F]{6}$/.test(fgHex)) return fgHex;
    if (this.contrastRatio(bgHex, fgHex) >= minRatio) return fgHex;
    const contrastWithBlack = this.contrastRatio(bgHex, '#111827');
    const contrastWithWhite = this.contrastRatio(bgHex, '#ffffff');
    return contrastWithBlack >= contrastWithWhite ? '#111827' : '#ffffff';
  }

  private hexToRgbString(hex: string): string | null {
    const h = hex.replace('#', '');
    if (h.length !== 6) return null;
    return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`;
  }

  private darkenHex(hex: string, amount: number): string {
    const h = hex.replace('#', '');
    const r = Math.max(0, parseInt(h.slice(0, 2), 16) - amount).toString(16).padStart(2, '0');
    const g = Math.max(0, parseInt(h.slice(2, 4), 16) - amount).toString(16).padStart(2, '0');
    const b = Math.max(0, parseInt(h.slice(4, 6), 16) - amount).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  // ─── Stripe Payment ───────────────────────────────────────────────────────
  private async initStripePayment(clientSecret: string): Promise<void> {
    this._stripe = await loadStripe(this.stripePublishableKey()!);
    if (!this._stripe) return;

    this._elements = this._stripe.elements({ clientSecret, locale: 'de' });
    const el = this._elements.create('payment');

    // DOM muss im 'payment'-State gerendert sein bevor wir mounten
    setTimeout(() => {
      this.zone.run(() => {
        el.mount('#stripe-payment-element');
      });
    }, 150);
  }

  async confirmPayment(): Promise<void> {
    if (!this._stripe || !this._elements) return;

    this.state.set('paying');
    this.paymentError.set('');

    const { error } = await this._stripe.confirmPayment({
      elements:      this._elements,
      confirmParams: { return_url: window.location.href },
    });

    this.zone.run(() => {
      if (error) {
        this.state.set('payment');
        this.paymentError.set(error.message ?? 'Zahlung fehlgeschlagen. Bitte erneut versuchen.');
      } else {
        this.state.set('success');
      }
    });
  }

  toggleMenu(): void { this.menuOpen.update(v => !v); }

  isRequired(field: string): boolean {
    return this.requiredFields().includes(field);
  }

  selectVenue(venue: WidgetVenue): void {
    this.selectedVenue.set(venue);
  }

  onTimeChange(val: string): void {
    this.time.set(val);
  }

  weiter(): void {
    if (!this.canSubmit()) return;

    const venue = this.selectedVenue()!;
    // Sicherheitsprüfung: nur Zeiten aus dem Slot-Array akzeptieren
    const slots = this.timeSlots();
    const raw   = this.validTime();
    const time  = slots.includes(raw) ? raw : slots[0];
    if (!time) return;  // Sollte nie passieren, da canSubmit hasBookableSlots prüft
    this.state.set('submitting');
    this.errorMessage.set('');

    let notesText = this.notes().trim();
    if (this.kinderStuehleAktiv() && this.kinderStuehle() > 0) {
      notesText = [notesText, `Kinderstühle: ${this.kinderStuehle()}`].filter(Boolean).join(' | ');
    }
    if (this.rollstuhlAktiv() && this.rollstuhl()) {
      notesText = [notesText, 'Rollstuhlplatz benötigt'].filter(Boolean).join(' | ');
    }
    if (this.hundAktiv() && this.hund()) {
      notesText = [notesText, 'Hund dabei'].filter(Boolean).join(' | ');
    }
    if (this.allergeneAktiv() && this.selectedAllergene().length > 0) {
      const labels = this.selectedAllergene()
        .map(key => this.verfuegbareAllergene().find(a => a.key === key)?.label ?? key)
        .join(', ');
      notesText = [notesText, `Allergene: ${labels}`].filter(Boolean).join(' | ');
    }
    if (this.tischartenAktiv() && this.tischartenModus() === 'liste' && this.selectedTischart()) {
      const found = this.alleTischarten.find(t => t.key === this.selectedTischart());
      const label = found ? found.label : this.selectedTischart();
      notesText = [notesText, `Tischart: ${label}`].filter(Boolean).join(' | ');
    }

    let tableId: number | undefined;
    if (this.tischartenAktiv()) {
      if (this.tischartenModus() === 'plan') {
        // Sicherheitsprüfung: ein manuell gewählter Tisch darf nur übernommen
        // werden, wenn er für die aktuelle Personenzahl auch wirklich noch
        // passt (siehe clearInvalidTableSelectionEffect — das ist hier nur
        // die zusätzliche Absicherung direkt vorm Absenden).
        const chosen = this.selectedTableId();
        const chosenTable = chosen !== null ? this.availableTables().find(t => t.id === chosen) : undefined;
        tableId = (chosenTable && chosenTable.seats >= this.people()) ? chosenTable.id : undefined;
      } else if (this.tischartenModus() === 'liste' && this.selectedTischart()) {
        // Best-fit: smallest available table of selected type with enough seats
        const match = this.availableTables()
          .filter(t => t.type === this.selectedTischart() && t.seats >= this.people())
          .sort((a, b) => a.seats - b.seats)[0];
        tableId = match?.id;
      }
    }

    const successData = {
      name:   this.guestName().trim(),
      date:   this.date(),
      time:   time,
      people: this.people(),
      venue:  venue.name,
    };

    this.reservations.create({
      venue_id:          venue.id,
      guest_name:        this.guestName().trim(),
      guest_first_name:  this.guestFirstName().trim() || undefined,
      guest_email:       this.guestEmail().trim(),
      guest_phone:       this.guestPhone().trim() || undefined,
      party_size:        this.people(),
      starts_at:         toAtomDateTime(this.date(), time),
      notes:             notesText || undefined,
      occasion:          this.occasion().trim() || undefined,
      table_id:          tableId,
      duration_minutes:  this.effectiveDurationMinutes(),
      packages:          this.packageBuchungAktiv() && this.selectedPackages().length > 0
        ? this.selectedPackages().map(x => ({ package_id: x.pkg.id, quantity: x.quantity }))
        : undefined,
    }).subscribe({
      next: res => {
        // No-Show-Schutz hat Vorrang vor Sofortzahlung
        const needsAuthorize = this.noShowSchutzAktiv() && !!this.stripePublishableKey();
        const needsCharge    = !needsAuthorize && this.zahlungAktiv() && this.zahlungPflicht() && !!this.stripePublishableKey();
        const needsPayment   = needsAuthorize || needsCharge;
        this._paymentMode    = needsAuthorize ? 'authorize' : 'charge';

        if (needsPayment) {
          this.successInfo.set(successData);
          this.state.set('payment');
          this.reservations.createPaymentIntent(res.reservation.token, this._paymentMode).subscribe({
            next: async ({ client_secret }) => {
              await this.initStripePayment(client_secret);
            },
            error: () => {
              this.zone.run(() => {
                this.state.set('error');
                this.errorMessage.set('Zahlung konnte nicht initialisiert werden. Bitte erneut versuchen.');
              });
            },
          });
        } else {
          this.state.set('success');
          this.successInfo.set(successData);
        }
      },
      error: err => {
        this.state.set('error');
        const body = err?.error;
        if (body?.error) {
          this.errorMessage.set(body.error);
        } else if (body?.errors) {
          const first = Object.values(body.errors)[0];
          this.errorMessage.set(String(first ?? 'Reservierung fehlgeschlagen.'));
        } else {
          this.errorMessage.set('Reservierung konnte nicht gespeichert werden.');
        }
      },
    });
  }

  reset(): void {
    this.date.set(this.today);
    this.time.set('19:00');
    this.people.set(2);
    this.guestName.set('');
    this.guestFirstName.set('');
    this.guestEmail.set('');
    this.guestPhone.set('');
    this.notes.set('');
    this.occasion.set('');
    this.packageQuantities.set({});
    this.state.set('idle');
    this.errorMessage.set('');
    this.successInfo.set(null);
    this.cardStep.set(1);
    this.cardConsent.set(false);
    this.cardShowErrors.set(false);
    this.cardWasOnSummary.set(false);
    this.cardTischwahlError.set(false);
    this.cardOpenPicker.set(null);
    this.sidebarStep.set(1);
    this.sidebarConsent.set(false);
    this.sidebarOpenPicker.set(null);
    this.sidebarWasOnSummary.set(false);
    this.sidebarShowErrors.set(false);
    this.sidebarTischwahlError.set(false);
    this.stackedStep.set(1);
    this.stackedConsent.set(false);
    this.stackedShowErrors.set(false);
    this.stackedWasOnSummary.set(false);
    this.stackedOpenPicker.set(null);
    this.stackedTischwahlError.set(false);
    this.plannerStep.set(1);
    this.plannerMaxStep.set(1);
    this.plannerConsent.set(false);
    this.plannerShowErrors.set(false);
    this.plannerWasOnSummary.set(false);
    this.plannerDialPhase.set('hour');
    this.plannerTischwahlError.set(false);
    const filteredReset = this.filteredVenues();
    // Gleiche Logik wie beim initialen Laden: ist die Raumauswahl aktiv und
    // gibt es mehrere Räume, keinen Raum vorbelegen, damit die Raum-Auswahl
    // (needsVenuePick) vor der nächsten Buchung erneut zuerst angezeigt wird.
    this.selectedVenue.set(
      filteredReset.length > 0 && !(this.raumauswahl() && filteredReset.length > 1)
        ? filteredReset[0]
        : null
    );
    this.kinderStuehle.set(0);
    this.rollstuhl.set(false);
    this.hund.set(false);
    this.selectedAllergene.set([]);
    this.selectedTischart.set('');
    this.selectedTableId.set(null);
    this.tischwahlChoice.set(null);
    this.tischplanOverlayOpen.set(false);
    // Ohne diesen Reset würde needsTischwahlPick() bei einer zweiten Buchung
    // in derselben Sitzung sofort wieder true liefern (weil hasPassedInitial-
    // DateTime aus der vorherigen Buchung noch true wäre) und den Zwischen-
    // schritt fälschlich überspringen bzw. verfrüht anzeigen.
    this.hasPassedInitialDateTime.set(false);
  }

  formatDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }
}
