import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { combineLatest, switchMap, of } from 'rxjs';

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
  DayAvailability,
  BookedPeriod,
  Break,
  toAtomDateTime,
} from '../../services/reservations.service';

type SubmitState = 'loading' | 'idle' | 'submitting' | 'success' | 'error';

const DEFAULT_FROM = '10:00';
const DEFAULT_TO   = '23:00';

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

  // ─── Config vom Backend ──────────────────────────────────────────────────
  restaurantName = signal('');
  venues         = signal<WidgetVenue[]>([]);
  selectedVenue  = signal<WidgetVenue | null>(null);

  // ─── Widget-Design (aus widgetDesign-Settings) ───────────────────────────
  layout           = signal<string>('card');
  imageUrl         = signal<string | null>(null);
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
  guestName  = signal<string>('');
  guestEmail = signal<string>('');
  guestPhone = signal<string>('');
  notes      = signal<string>('');

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
  maxPersonenText         = signal<string>('Für Gruppen ab dieser Personenzahl bitten wir um Kontaktaufnahme.');
  maxPersonenPhone        = signal<string>('');
  maxPersonenEmail        = signal<string>('');
  raumauswahl             = signal<boolean>(false);
  raumauswahlAktiveIds    = signal<string[]>([]);
  menuOpen                = signal<boolean>(false);
  hinweisOpen             = signal<boolean>(false);

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

  // ─── Vorausbuchung ───────────────────────────────────────────────────────
  vorausbuchungEinheit = signal<string>('monate');
  vorausbuchungWert    = signal<number>(12);

  // ─── Mindestvorlauf ──────────────────────────────────────────────────────
  mindestvorlaufMinuten     = signal<number>(60);
  defaultDurationMinutes    = signal<number>(120);

  // ─── Tischarten ──────────────────────────────────────────────────────────
  tischartenAktiv      = signal<boolean>(false);
  tischartenAktiveTypes = signal<string[]>(['round', 'square', 'long']);
  selectedTischart     = signal<string>('');
  tischartenModus      = signal<string>('liste');
  selectedTableId      = signal<number | null>(null);

  // ─── Tischplan-Zwischenschritt (Tablet+) ─────────────────────────────────
  windowWidth            = signal(typeof window !== 'undefined' ? window.innerWidth : 1024);
  readonly isTablet      = computed(() => this.windowWidth() >= 768);
  tischwahlActive        = signal(false);   // Zwischenschritt-Overlay: auto vs. selbst
  tischplanOverlayOpen   = signal(false);   // Vollbild-Tischplan-Overlay

  // ─── Geschlossene Wochentage (0=Mo … 6=So) ───────────────────────────────
  closedWeekdays = signal<number[]>([]);

  // ─── Online Änderungen / Stornierung ─────────────────────────────────────
  onlineAenderungen        = signal<boolean>(false);
  onlineAenderungenMinuten = signal<number>(120);
  onlineStornierung        = signal<boolean>(false);
  onlineStornierungMinuten = signal<number>(120);

  readonly weekdays: readonly string[] = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  /** Personen-Auswahl 1 … maxPeople, die letzte Option mit "+" (Standard 8 → "8+ Gäste"). */
  readonly seatOptions = computed<readonly { count: number; label: string }[]>(() => {
    const max = this.maxPeople();
    return Array.from({ length: max }, (_, i) => {
      const count = i + 1;
      const label = count === 1 ? '1 Gast' : count === max ? `${count}+ Gäste` : `${count} Gäste`;
      return { count, label };
    });
  });

  decrement(): void { this.people.update(n => Math.max(this.minPeople, n - 1)); }
  increment(): void { this.people.update(n => Math.min(this.maxPeople(), n + 1)); }

  // ─── Kalender-State ──────────────────────────────────────────────────────
  calendarMonth = signal<number>(new Date().getMonth());
  calendarYear  = signal<number>(new Date().getFullYear());

  // ─── Card-Layout-State ───────────────────────────────────────────────────
  cardStep       = signal<1 | 2>(1);
  cardOpenPicker = signal<'date' | 'time' | 'seats' | null>(null);
  cardConsent    = signal(false);

  // ─── Sidebar-Layout-State ─────────────────────────────────────────────────
  sidebarStep       = signal<1 | 2>(1);
  sidebarOpenPicker = signal<'date' | 'time' | 'seats' | null>(null);
  sidebarConsent    = signal(false);

  // ─── Stacked-Layout-State ────────────────────────────────────────────────
  stackedStep       = signal<1 | 2>(1);
  stackedOpenPicker = signal<'date' | 'time' | 'seats' | null>(null);
  stackedConsent    = signal(false);

  // ─── Planner-Layout-State ────────────────────────────────────────────────
  plannerStep      = signal<1 | 2 | 3 | 4>(1);
  plannerConsent   = signal(false);
  plannerDialPhase = signal<'hour' | 'minute'>('hour');

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

  readonly isClosedDay = computed(() => this.dayAvail()?.open === false);

  readonly showMaxPersonenWarning = computed(() => this.people() >= this.maxPeople());
  /** Gruppen-Hinweis (Kontakt bei großen Gruppen) — gleiche Bedingung wie die Warnung. */
  readonly showMaxPersonenInfo    = computed(() => this.showMaxPersonenWarning());

  readonly safeMenuUrl = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.speisekarteUrl() || '')
  );

  readonly filteredVenues = computed<WidgetVenue[]>(() => {
    const all = this.venues();
    if (!this.raumauswahl() || this.raumauswahlAktiveIds().length === 0) return all;
    const ids = this.raumauswahlAktiveIds();
    return all.filter(v => ids.includes(v.id));
  });

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

    // Slots ausblenden wo ALLE Tische im Raum belegt sind
    const periods    = avail?.bookedPeriods ?? [];
    const totalTables = avail?.totalTables ?? 0;
    const duration   = this.defaultDurationMinutes();

    if (totalTables > 0 && periods.length > 0) {
      slots = slots.filter(slotTime => {
        const [sh, sm] = slotTime.split(':').map(Number);
        const slotStart = sh * 60 + sm;
        const slotEnd   = slotStart + duration;

        let concurrent = 0;
        for (const p of periods) {
          const [fh, fm] = p.from.split(':').map(Number);
          const [th, tm] = p.to.split(':').map(Number);
          const pStart = fh * 60 + fm;
          const pEnd   = th * 60 + tm;
          if (pStart < slotEnd && pEnd > slotStart) concurrent++;
        }
        return concurrent < totalTables;
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
    return !!this.selectedVenue() &&
      !!this.date() &&
      this.hasBookableSlots() &&       // echte Slots müssen vorhanden sein
      !!this.validTime() &&
      !this.isClosedDay() &&
      !this.showMaxPersonenWarning() &&
      this.people() >= this.minPeople &&
      this.guestName().trim().length >= 2 &&
      this.emailLooksOk() &&
      (!req.includes('phone') || this.guestPhone().trim().length > 0) &&
      (!req.includes('notes') || this.notes().trim().length > 0) &&
      (!this.tischartenAktiv() || this.tischartenModus() !== 'liste' || !!this.selectedTischart()) &&
      consent &&
      this.state() !== 'submitting';
  });

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
    const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
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
    const closed = this.closedWeekdays();
    const cells: { day: number | null; isToday: boolean; isSelected: boolean; isDisabled: boolean }[] = [];
    for (let i = 0; i < monthStartWeekday; i++) cells.push({ day: null, isToday: false, isSelected: false, isDisabled: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(y, m, d);
      const weekday = (cellDate.getDay() + 6) % 7;
      const isDisabled = cellDate < todayStart || cellDate > maxD || closed.includes(weekday);
      cells.push({ day: d, isToday: isCurrentMonth && d === todayDay, isSelected: d === sel, isDisabled });
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
    const cx = 70, cy = 70, r = 55;
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

  /** Y-Endpunkt der Nadel — immer äußerer Ring (r=55 → y=15). */
  readonly dialPhaseNeedleEndY = computed(() => 15);

  /** SVG-Positionen der Minuten-Dots je nach Intervall. */
  readonly dialPhaseMinuteDots = computed(() => {
    const cx = 70, cy = 70, r = 53;
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
    this.date.set(`${y}-${mStr}-${dStr}`);
  }

  // ─── Card methods ─────────────────────────────────────────────────────────
  cardTogglePicker(p: 'date' | 'time' | 'seats'): void {
    this.cardOpenPicker.set(this.cardOpenPicker() === p ? null : p);
  }
  cardClosePicker(): void { this.cardOpenPicker.set(null); }
  cardNextStep(): void {
    this.cardClosePicker();
    if (this.tischartenAktiv() && this.tischartenModus() === 'plan' && this.suitableTables().length > 0) {
      this.tischwahlActive.set(true);
    } else {
      this.cardStep.set(2);
    }
  }
  cardPrevStep(): void { this.cardStep.set(1); }
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
    if (this.tischartenAktiv() && this.tischartenModus() === 'plan' && this.suitableTables().length > 0) {
      this.tischwahlActive.set(true);
    } else {
      this.sidebarStep.set(2);
    }
  }
  sidebarPrevStep(): void { this.sidebarStep.set(1); }
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
    if (this.tischartenAktiv() && this.tischartenModus() === 'plan' && this.suitableTables().length > 0) {
      this.tischwahlActive.set(true);
    } else {
      this.stackedStep.set(2);
    }
  }
  stackedPrevStep(): void { this.stackedStep.set(1); }
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

  readonly availableTables = computed<WidgetVenueTable[]>(() => {
    const booked = this.availability()?.bookedTableNumbers ?? [];
    return this.venueTables().filter(t => !booked.includes(t.id));
  });

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
      const baseW = (isWide || isWindow) ? 140 : 70;
      const baseH = isWindow ? 32 : 70;
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
  setPlannerStep(s: 1 | 2 | 3 | 4): void { this.plannerStep.set(s); }
  plannerPrev(): void {
    // Im Minuten-Modus: erst zurück zur Stunden-Auswahl
    if (this.plannerStep() === 2 && this.plannerDialPhase() === 'minute') {
      this.plannerDialPhase.set('hour');
      return;
    }
    const s = this.plannerStep();
    if (s > 1) this.plannerStep.set((s - 1) as 1 | 2 | 3 | 4);
  }
  plannerNext(): void {
    const s = this.plannerStep();
    if (s < 4) this.plannerStep.set((s + 1) as 1 | 2 | 3 | 4);
  }
  plannerToggleConsent(): void { this.plannerConsent.update(v => !v); }
  selectPlannerDay(day: number): void { this.selectDay(day); this.setPlannerStep(2); }
  selectPlannerTime(t: string): void { this.time.set(t); this.setPlannerStep(3); }

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
  selectPlannerSeats(n: number): void {
    this.people.set(n);
    if (this.tischartenAktiv() && this.tischartenModus() === 'plan' && this.suitableTables().length > 0) {
      this.tischwahlActive.set(true);
    } else {
      this.setPlannerStep(4);
    }
  }

  // ─── Tischplan-Zwischenschritt-Methoden ───────────────────────────────────
  tischwahlAutoAssign(): void {
    this.selectedTableId.set(null);
    this.tischwahlActive.set(false);
    this.proceedAfterTischwahl();
  }

  tischwahlSelbst(): void {
    this.tischwahlActive.set(false);
    this.tischplanOverlayOpen.set(true);
  }

  tischplanOverlayConfirm(): void {
    this.tischplanOverlayOpen.set(false);
    this.proceedAfterTischwahl();
  }

  tischplanOverlayBack(): void {
    this.tischplanOverlayOpen.set(false);
    this.tischwahlActive.set(true);
  }

  private proceedAfterTischwahl(): void {
    switch (this.layout()) {
      case 'card':    this.cardStep.set(2);     break;
      case 'sidebar': this.sidebarStep.set(2);  break;
      case 'stacked': this.stackedStep.set(2);  break;
      case 'planner': this.setPlannerStep(4);   break;
    }
  }

  ngOnInit(): void {
    const publicKey = this.route.snapshot.queryParamMap.get('key') ?? environment.publicKey;

    if (!publicKey) {
      this.state.set('error');
      this.errorMessage.set('Kein Public Key angegeben. Bitte Widget-URL mit ?key=DEIN_KEY aufrufen.');
      return;
    }

    this.loadConfig(publicKey);

    // Config neu laden wenn der Tab sichtbar wird (Tab-Wechsel) ODER
    // das Fenster den Fokus bekommt (z.B. Admin-Tab → Widget-Tab click).
    // Nur wenn kein Buchungsvorgang läuft.
    const reloadIfIdle = () => {
      if (this.state() === 'idle') this.loadConfig(publicKey);
    };
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reloadIfIdle();
    });
    window.addEventListener('focus', reloadIfIdle);

    // Fensterbreite für Tablet-Erkennung tracken
    window.addEventListener('resize', () => this.windowWidth.set(window.innerWidth));
  }

  private loadConfig(publicKey: string): void {
    this.reservations.loadConfig(publicKey).subscribe(config => {
      this.restaurantName.set(config.name);
      this.venues.set(config.venues);
      this.applyDesign(config.widgetDesign);
      this.applyFunctional(config.widgetFunctional);
      if (Array.isArray(config.allergene)) this.verfuegbareAllergene.set(config.allergene);

      const closed = config.closedWeekdays ?? [];
      this.closedWeekdays.set(closed);

      // Find the first selectable day: not a closed weekday, and if it's today
      // still has time slots left (current time + mindestvorlauf < latest slot).
      {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const cutoff = nowMinutes + this.mindestvorlaufMinuten();
        // Conservative latest slot: 23:00 = 1380 min. If cutoff >= that, today has no slots.
        const latestSlotMinutes = 23 * 60;

        let d = new Date(this.today + 'T00:00:00');
        for (let i = 0; i < 60; i++) {
          const wd = (d.getDay() + 6) % 7;
          // Wichtig: localDate() statt toISOString() verwenden, damit der
          // Vergleich in der lokalen Zeitzone stimmt, nicht in UTC.
          const isToday = StartComponent.localDate(d) === this.today;
          if (closed.includes(wd)) { d.setDate(d.getDate() + 1); continue; }
          if (isToday && cutoff >= latestSlotMinutes) { d.setDate(d.getDate() + 1); continue; }
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
      // Always pre-select the first venue so availability is checked immediately.
      // When raumauswahl is true the chips still show and the user can switch rooms.
      if (filtered.length > 0) {
        this.selectedVenue.set(filtered[0]);
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

    // Legacy --w-* variables (keep for backward compat)
    if (design.colorPrimary) {
      root.style.setProperty('--w-color-primary', design.colorPrimary);
      const rgb = this.hexToRgbString(design.colorPrimary);
      if (rgb) root.style.setProperty('--w-color-primary-rgb', rgb);
      root.style.setProperty('--w-color-primary-dark', this.darkenHex(design.colorPrimary, 20));
    }
    if (design.colorText)       root.style.setProperty('--w-color-text', design.colorText);
    if (design.colorBackground) {
      root.style.setProperty('--w-color-bg', design.colorBackground);
      root.style.setProperty('--w-color-surface', design.colorBackground);
    }
    if (fontStack) root.style.setProperty('--w-font', fontStack);
    if (fontSize)  root.style.setProperty('font-size', fontSize);
    if (radiusPx !== undefined) {
      root.style.setProperty('--w-radius',    `${radiusPx}px`);
      root.style.setProperty('--w-radius-sm', `${Math.max(4, Math.round(radiusPx * 0.7))}px`);
    }

    // --preview-* variables for the layout components
    if (design.colorPrimary)    root.style.setProperty('--preview-primary', design.colorPrimary);
    if (design.colorText)       root.style.setProperty('--preview-text', design.colorText);
    if (design.colorBackground) root.style.setProperty('--preview-bg', design.colorBackground);

    // Kachel-Hintergrund (fällt auf colorBackground zurück wenn nicht gesetzt)
    const cardBg = design.cardBackground ?? design.colorBackground ?? '#ffffff';
    root.style.setProperty('--preview-card-bg', cardBg);

    // Seiten-Hintergrund auf body anwenden
    const body = document.body;
    const pb = design.pageBackground;
    if (pb) {
      if (pb.type === 'color' && pb.value) {
        body.style.background = pb.value;
      } else if (pb.type === 'image' && pb.value) {
        body.style.background = `url(${pb.value}) center/cover no-repeat fixed`;
      }
    }

    const isDark = this.isDarkBackground(design.colorBackground ?? '#ffffff');
    root.style.setProperty('--preview-muted',  isDark ? 'rgba(255,255,255,0.6)' : '#6b7280');
    root.style.setProperty('--preview-border', isDark ? 'rgba(255,255,255,0.14)' : '#e5e7eb');
    root.style.setProperty('--preview-soft',   isDark ? 'rgba(255,255,255,0.06)' : '#f9fafb');
    if (fontStack) root.style.setProperty('--preview-font', fontStack);
    if (fontSize)  root.style.setProperty('--preview-base', fontSize);
    const capped = Math.min(radiusPx ?? 10, 14);
    root.style.setProperty('--preview-radius',     `${capped}px`);
    root.style.setProperty('--preview-radius-cta', `${radiusPx ?? 10}px`);

    // Signal assignments
    if (design.layout)           this.layout.set(design.layout);
    if (design.imageUrl !== undefined) this.imageUrl.set(design.imageUrl);
    if (design.headingAlignment) this.headingAlignment.set(design.headingAlignment);
    if (design.headingTitle)     this.headingTitle.set(design.headingTitle);
    if (design.headingSubtitle !== undefined) this.headingSubtitle.set(design.headingSubtitle ?? '');
    if (design.buttonLabel)      this.buttonLabel.set(design.buttonLabel);
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
    if (func.vorausbuchungEinheit)                     this.vorausbuchungEinheit.set(func.vorausbuchungEinheit);
    if (typeof func.vorausbuchungWert === 'number')    this.vorausbuchungWert.set(func.vorausbuchungWert);
    if (typeof func.mindestvorlaufMinuten === 'number')  this.mindestvorlaufMinuten.set(func.mindestvorlaufMinuten);
    if (typeof func.defaultDurationMinutes === 'number') this.defaultDurationMinutes.set(func.defaultDurationMinutes);
    if (typeof func.tischartenAktiv === 'boolean')     this.tischartenAktiv.set(func.tischartenAktiv);
    if (Array.isArray(func.tischartenAktiveTypes))     this.tischartenAktiveTypes.set(func.tischartenAktiveTypes);
    if (func.tischartenAuswahlModus)                   this.tischartenModus.set(func.tischartenAuswahlModus);
    if (typeof func.onlineAenderungen === 'boolean')   this.onlineAenderungen.set(func.onlineAenderungen);
    if (typeof func.onlineAenderungenMinuten === 'number') this.onlineAenderungenMinuten.set(func.onlineAenderungenMinuten);
    if (typeof func.onlineStornierung === 'boolean')   this.onlineStornierung.set(func.onlineStornierung);
    if (typeof func.onlineStornierungMinuten === 'number') this.onlineStornierungMinuten.set(func.onlineStornierungMinuten);
  }

  private isDarkBackground(hex: string): boolean {
    const h = hex.replace('#', '');
    if (h.length !== 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) / 255 < 0.5;
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

  toggleMenu(): void { this.menuOpen.update(v => !v); }

  isRequired(field: string): boolean {
    return this.requiredFields().includes(field);
  }

  selectVenue(venue: WidgetVenue): void {
    this.selectedVenue.set(venue);
  }

  // Raumwechsel direkt im Tischplan-Overlay — setzt Tischauswahl zurück
  selectVenueInPlan(venue: WidgetVenue): void {
    this.selectedVenue.set(venue);
    this.selectedTableId.set(null);
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
        tableId = this.selectedTableId() ?? undefined;
      } else if (this.tischartenModus() === 'liste' && this.selectedTischart()) {
        // Best-fit: smallest available table of selected type with enough seats
        const match = this.availableTables()
          .filter(t => t.type === this.selectedTischart() && t.seats >= this.people())
          .sort((a, b) => a.seats - b.seats)[0];
        tableId = match?.id;
      }
    }

    this.reservations.create({
      venue_id:          venue.id,
      guest_name:        this.guestName().trim(),
      guest_email:       this.guestEmail().trim(),
      guest_phone:       this.guestPhone().trim() || undefined,
      party_size:        this.people(),
      starts_at:         toAtomDateTime(this.date(), time),
      notes:             notesText || undefined,
      table_id:          tableId,
      duration_minutes:  this.defaultDurationMinutes(),
    }).subscribe({
      next: () => {
        this.state.set('success');
        this.successInfo.set({
          name:   this.guestName().trim(),
          date:   this.date(),
          time:   time,
          people: this.people(),
          venue:  venue.name,
        });
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
    this.guestEmail.set('');
    this.guestPhone.set('');
    this.notes.set('');
    this.state.set('idle');
    this.errorMessage.set('');
    this.successInfo.set(null);
    this.cardStep.set(1);
    this.cardConsent.set(false);
    this.sidebarStep.set(1);
    this.sidebarConsent.set(false);
    this.stackedStep.set(1);
    this.stackedConsent.set(false);
    this.plannerStep.set(1);
    this.plannerConsent.set(false);
    if (this.filteredVenues().length > 0) {
      this.selectedVenue.set(this.filteredVenues()[0]);
    }
    this.kinderStuehle.set(0);
    this.rollstuhl.set(false);
    this.hund.set(false);
    this.selectedAllergene.set([]);
    this.selectedTischart.set('');
    this.selectedTableId.set(null);
    this.tischwahlActive.set(false);
    this.tischplanOverlayOpen.set(false);
  }

  formatDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }
}
