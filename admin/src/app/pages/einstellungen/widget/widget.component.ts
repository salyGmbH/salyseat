import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import {
  CornerRadiusKey,
  DEFAULT_WIDGET_DESIGN,
  FontFamilyKey,
  FontSizeKey,
  PageBackground,
  PageBackgroundType,
  TextAlignment,
  WidgetLayoutMode,
} from '../../../services/tenant-settings.service';
import { WidgetDesignService } from '../../../services/widget-design.service';
import { TenantSettingsService } from '../../../services/tenant-settings.service';

interface LayoutOption {
  key: WidgetLayoutMode;
  label: string;
  tagline: string;
  description: string;
}

interface FontFamilyOption {
  key: FontFamilyKey;
  label: string;
  /** CSS font-family Stack */
  stack: string;
  /** Kurze Stilbeschreibung */
  hint: string;
}

interface FontSizeOption {
  key: FontSizeKey;
  label: string;
  hint: string;
  /** Basisgröße in px (für Body-Text). */
  basePx: number;
}

interface RadiusOption {
  key: CornerRadiusKey;
  label: string;
  /** CSS border-radius für Cards/Inputs. */
  px: number;
}

interface AlignmentOption {
  key: TextAlignment;
  label: string;
  icon: string;
}

/**
 * Widget-Einstellungen.
 *
 * Aktuell rein lokal (kein Backend-Persist). Sobald die Persistenz steht,
 * wird das gesamte WidgetSettings-Objekt in den TenantSettingsService
 * geschrieben und beim Laden wiederhergestellt.
 *
 * Aufbau analog zu Shopware 6 CMS-Elementen:
 *   • Pro Bereich eine Karte (Layout, Überschrift, Typografie, Farben,
 *     Button …).
 *   • Live-Vorschau unten zeigt jede Änderung sofort.
 */
@Component({
  selector: 'app-widget',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, TranslateModule],
  templateUrl: './widget.component.html',
  styleUrl: './widget.component.scss',
})
export class WidgetComponent {

  private readonly widgetDesign    = inject(WidgetDesignService);
  private readonly tenantSettings  = inject(TenantSettingsService);
  private readonly http            = inject(HttpClient);
  private readonly translate       = inject(TranslateService);

  /** Public Key des aktuellen Tenants — für den Embed-Code. */
  readonly publicKey = this.tenantSettings.publicKey;

  /** Embed-Code der dem Kunden auf der Website eingebunden wird. */
  readonly embedCode = computed(() => {
    const key = this.publicKey();
    if (!key) return '<!-- Public Key wird geladen… -->';
    return `<iframe\n  src="https://widget.salyseat.de/?key=${key}"\n  width="100%"\n  height="700"\n  frameborder="0"\n  style="border-radius:12px"\n></iframe>`;
  });

  embedCopied = false;
  copyEmbed(): void {
    navigator.clipboard.writeText(this.embedCode()).then(() => {
      this.embedCopied = true;
      setTimeout(() => this.embedCopied = false, 2000);
    });
  }

  constructor() {
    // toObservable + filter + take(1) vermeidet NG0600 (Signal-Writes in effects
    // erfordern in Angular 18 allowSignalWrites: true). Feuert genau einmal wenn
    // isLoaded true wird, dann automatisches Unsubscribe.
    toObservable(this.widgetDesign.isLoaded)
      .pipe(filter(loaded => loaded), take(1))
      .subscribe(() => {
        const s = this.widgetDesign.settings();
        this.selectedLayout.set(s.layout);
        this.imageUrl.set(s.imageUrl);
        this.headingTitle.set(s.headingTitle);
        this.headingSubtitle.set(s.headingSubtitle);
        this.headingAlignment.set(s.headingAlignment);
        this.showSubtitle.set(s.showSubtitle);
        this.selectedFontFamily.set(s.fontFamily);
        this.selectedFontSize.set(s.fontSize);
        this.colorPrimary.set(s.colorPrimary);
        this.colorText.set(s.colorText);
        this.colorBackground.set(s.colorBackground);
        this.cardBackground.set(s.cardBackground ?? s.colorBackground);
        this.pageBackground.set(s.pageBackground ?? { type: 'color', value: '#f4f5f7' });
        this.buttonLabel.set(s.buttonLabel);
        this.selectedRadius.set(s.cornerRadius);
      });
  }

  // ──────────────────────────────────────────────────────────────────────
  //  01  Layout (optische Stilrichtung)
  // ──────────────────────────────────────────────────────────────────────
  readonly layoutOptions: LayoutOption[] = [
    { key: 'card',    label: 'widget.layout_card',    tagline: 'widget.layout_card_tagline',    description: 'widget.layout_card_desc'    },
    { key: 'sidebar', label: 'widget.layout_sidebar', tagline: 'widget.layout_sidebar_tagline', description: 'widget.layout_sidebar_desc' },
    { key: 'stacked', label: 'widget.layout_stacked', tagline: 'widget.layout_stacked_tagline', description: 'widget.layout_stacked_desc' },
    { key: 'planner', label: 'widget.layout_planner', tagline: 'widget.layout_planner_tagline', description: 'widget.layout_planner_desc' },
  ];

  readonly selectedLayout = signal<WidgetLayoutMode>('card');
  setLayout(mode: WidgetLayoutMode): void { this.selectedLayout.set(mode); }
  readonly previewClass = computed(() => `preview--${this.selectedLayout()}`);

  /** True, wenn das aktuelle Layout ein Bild benötigt. */
  readonly needsImage = computed(() =>
    this.selectedLayout() === 'card' || this.selectedLayout() === 'sidebar');

  /** Titel in einzelne Wörter zerlegt — für den Sidebar-Stil, wo jedes Wort
   *  auf einer eigenen Zeile uppercase erscheint (BUCHEN / ONLINE). */
  readonly titleWords = computed(() =>
    this.headingTitle().trim().split(/\s+/).filter(w => w.length > 0));

  // ──────────────────────────────────────────────────────────────────────
  //  Daten für den Planer-Stil (rein visuelle Demo — kein Backend-State).
  //  Realer State (welcher Tag/Zeit/Personenanzahl ist gewählt) kommt
  //  später aus dem Booking-Form-State; hier nur, damit die Vorschau
  //  realistisch aussieht.
  // ──────────────────────────────────────────────────────────────────────

  /** Wochentags-Kürzel (für Kalender-Header). */
  readonly plannerWeekdays: readonly string[] = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  /**
   * Drei-Stufen-Wizard im Planer-Stil:
   *   1 — Datumsauswahl (Kalender)
   *   2 — Uhrzeitauswahl (Chips)
   *   3 — Personenanzahl (Chips)
   * Live-State für die Vorschau, damit man durchklicken kann.
   */
  readonly plannerStep          = signal<1 | 2 | 3 | 4>(1);
  readonly plannerSelectedDay   = signal<number>(2);
  readonly plannerSelectedTime  = signal<string>('19:00');
  readonly plannerSelectedSeats = signal<number>(2);
  /** DSGVO-Einwilligung für Layout-4-Daten-Step. Pflichtfeld vor Submit. */
  readonly plannerConsent       = signal<boolean>(false);

  readonly plannerCalendarMonth = signal<number>(4);  
  readonly plannerCalendarYear  = signal<number>(2026);
  readonly plannerCalendarMonthLabel = computed(() => {
    const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    return `${months[this.plannerCalendarMonth()]} ${this.plannerCalendarYear()}`;
  });

  /** Kalender einen Monat zurück. */
  plannerPrevMonth(): void {
    let m = this.plannerCalendarMonth() - 1;
    let y = this.plannerCalendarYear();
    if (m < 0) { m = 11; y -= 1; }
    this.plannerCalendarMonth.set(m);
    this.plannerCalendarYear.set(y);
  }

  /** Kalender einen Monat vor. */
  plannerNextMonth(): void {
    let m = this.plannerCalendarMonth() + 1;
    let y = this.plannerCalendarYear();
    if (m > 11) { m = 0; y += 1; }
    this.plannerCalendarMonth.set(m);
    this.plannerCalendarYear.set(y);
  }

  setPlannerStep(s: 1 | 2 | 3 | 4): void { this.plannerStep.set(s); }
  plannerPrev(): void {
    const s = this.plannerStep();
    if (s > 1) this.plannerStep.set((s - 1) as 1 | 2 | 3 | 4);
  }
  /** Vor (CTA-Button auf Schritt 1–3 — auf 4 ist es das Submit). */
  plannerNext(): void {
    const s = this.plannerStep();
    if (s < 4) this.plannerStep.set((s + 1) as 1 | 2 | 3 | 4);
  }
  /** DSGVO-Toggle für den Layout-4-Daten-Step. */
  plannerToggleConsent(): void { this.plannerConsent.set(!this.plannerConsent()); }

  /** Datum klicken → speichern + automatisch zur nächsten Stufe. */
  selectPlannerDay(day: number): void {
    this.plannerSelectedDay.set(day);
    this.setPlannerStep(2);
  }

  /** Uhrzeit klicken → speichern + automatisch zur Personenstufe. */
  selectPlannerTime(label: string): void {
    this.plannerSelectedTime.set(label);
    this.setPlannerStep(3);
  }

  /** Personenanzahl klicken → speichern + automatisch zum Daten-Step (4). */
  selectPlannerSeats(count: number): void {
    this.plannerSelectedSeats.set(count);
    this.setPlannerStep(4);
  }

  /** Anzeige des gewählten Datums im Format DD.MM.YYYY (folgt dem aktuellen Monat). */
  readonly plannerSelectedDateLabel = computed(() => {
    const d = this.plannerSelectedDay();
    const m = (this.plannerCalendarMonth() + 1).toString().padStart(2, '0');
    const y = this.plannerCalendarYear();
    return `${d.toString().padStart(2, '0')}.${m}.${y}`;
  });

  /**
   * Tage im Mini-Kalender — reagiert auf plannerCalendarMonth/Year, sodass
   * Vor- und Zurück-Buttons den Inhalt umschalten. Wochenstart Mo=0 (DE-Standard).
   */
  readonly plannerCalendarCells = computed(() => {
    const m = this.plannerCalendarMonth();
    const y = this.plannerCalendarYear();

    const firstOfMonth = new Date(y, m, 1);
    // JS getDay(): 0=So, 1=Mo, ..., 6=Sa. Mit (+6)%7 wird daraus Mo=0..So=6.
    const monthStartWeekday = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth       = new Date(y, m + 1, 0).getDate();

    const today          = new Date();
    const isCurrentMonth = today.getFullYear() === y && today.getMonth() === m;
    const todayDay       = today.getDate();
    const selectedDay    = this.plannerSelectedDay();

    const cells: { day: number | null; isToday: boolean; isSelected: boolean }[] = [];
    for (let i = 0; i < monthStartWeekday; i++) {
      cells.push({ day: null, isToday: false, isSelected: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        isToday:    isCurrentMonth && d === todayDay,
        isSelected: d === selectedDay,
      });
    }
    return cells;
  });

  /** Uhrzeit-Chips (Demo). */
  readonly plannerTimes: readonly { label: string }[] = [
    { label: '17:30' }, { label: '18:00' }, { label: '18:30' },
    { label: '19:00' }, { label: '19:30' }, { label: '20:00' },
    { label: '20:30' }, { label: '21:00' }, { label: '21:30' },
  ];

  /**
   * Watch-Face-Dial (Layout 4 — Uhrzeit-Stufe) — 24h-Zifferblatt.
   *
   * Konzept: Anstelle nur die verfügbaren Slots auf dem Kreis zu verteilen,
   * zeigt das Dial jetzt ein echtes 24-Stunden-Zifferblatt (0 oben, 6 rechts,
   * 12 unten, 18 links). Die Öffnungszeiten heben sich farblich ab:
   *
   *   – Stunden-Labels innerhalb der Öffnungszeiten: kräftig + Primary-Tint
   *   – Stunden außerhalb: stark abgedimmt
   *   – Ein heller Arc entlang des Außenrings markiert das Öffnungsfenster
   *   – Verfügbare Slots sind kleine farbige Punkte (klickbar)
   *
   * Das visuelle Konzept ist klar anders als RESERVISON's verschachtelte
   * 24h-Doppelringe — wir bleiben bei einem einzigen Zifferblatt mit
   * subtilen Hervorhebungen. Eine Stunde = 15° (360 / 24).
   */

  /** Öffnungszeitenspanne in Minuten — abgeleitet aus den verfügbaren Slots. */
  readonly plannerOpenRange = computed(() => {
    const minutes = this.plannerTimes.map(s => {
      const [h, m] = s.label.split(':').map(Number);
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
      // Volle Stunde davor / danach für die "is-open"-Hervorhebung der Labels
      startHour: Math.floor(startMin / 60),
      endHour:   Math.ceil(endMin / 60),
    };
  });

  /** Hilfsfunktion: minutes-of-day → clockAngle (0° oben, im Uhrzeigersinn). */
  private dialAngleForMinutes(min: number): number {
    return (min / 1440) * 360;
  }

  /**
   * 24 Stunden-Labels rund um das Dial. Jeder Eintrag enthält die
   * vor-berechnete (x, y)-Position im viewBox-Raum (0 0 140 140) und
   * Flags für die SCSS-Hervorhebung.
   */
  readonly plannerDialHours = computed(() => {
    const cx = 70, cy = 70, r = 53;
    const range = this.plannerOpenRange();
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
        // Kardinal-Stunden (0/6/12/18) leicht hervorgehoben
        isCardinal: h % 6 === 0,
      };
    });
  });

  /**
   * Verfügbare Slots — Position im viewBox-Raum als Punkt + Klick-Geometrie.
   * Punkte sitzen auf einem Radius zwischen Hour-Labels und Außenring.
   */
  readonly plannerDialSlots = computed(() => {
    const cx = 70, cy = 70, r = 60;
    const round = (n: number) => Math.round(n * 100) / 100;

    return this.plannerTimes.map(s => {
      const [h, m] = s.label.split(':').map(Number);
      const totalMin = h * 60 + m;
      const clockAngle = this.dialAngleForMinutes(totalMin);
      const mathRad = ((clockAngle - 90) * Math.PI) / 180;
      return {
        label: s.label,
        clockAngle,
        x: round(cx + r * Math.cos(mathRad)),
        y: round(cy + r * Math.sin(mathRad)),
        isHour: m === 0,
      };
    });
  });

  /**
   * SVG-Pfad für den Öffnungszeiten-Arc — zeichnet einen helleren Bogen
   * entlang des Außenrings, der genau über dem geöffneten Bereich liegt.
   * Bei einer Spanne > 180° wird der large-arc-flag gesetzt.
   */
  readonly plannerDialOpenArc = computed(() => {
    const range = this.plannerOpenRange();
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

  /**
   * Drehwinkel der Nadel — zeigt minutengenau auf den ausgewählten Slot.
   * Wird im SVG-transform-Attribut als `rotate(angle 70 70)` verwendet.
   */
  /** 24-Stunden-Chip-Ring für die neue Uhr-Vorschau. */
  readonly plannerDialHourChips = computed(() => {
    const cx = 70, cy = 70, r = 55;
    const round = (n: number) => Math.round(n * 100) / 100;
    const availableHours = new Set(
      this.plannerTimes.map(s => parseInt(s.label.split(':')[0], 10))
    );
    return Array.from({ length: 24 }, (_, h) => {
      const deg = h * 15 - 90;
      const rad = deg * Math.PI / 180;
      return {
        hour:        h,
        label:       String(h),
        x:           round(cx + r * Math.cos(rad)),
        y:           round(cy + r * Math.sin(rad)),
        isAvailable: availableHours.has(h),
      };
    });
  });

  /** Nadelwinkel: 15° pro Stunde (24h-Ring). */
  readonly plannerDialNeedleAngle = computed(() => {
    const [h] = this.plannerSelectedTime().split(':').map(Number);
    return h * 15;
  });

  /** Stunde klicken → ersten passenden Slot setzen. */
  selectPlannerHour(hour: number): void {
    const match = this.plannerTimes.find(s => parseInt(s.label.split(':')[0], 10) === hour);
    if (match) this.selectPlannerTime(match.label);
  }

  /** Personenanzahl-Chips (Demo). */
  readonly plannerSeats: readonly { count: number; label: string }[] = [
    { count: 1, label: '1 Gast'   },
    { count: 2, label: '2 Gäste'  },
    { count: 3, label: '3 Gäste'  },
    { count: 4, label: '4 Gäste'  },
    { count: 5, label: '5 Gäste'  },
    { count: 6, label: '6 Gäste'  },
    { count: 7, label: '7 Gäste'  },
    { count: 8, label: '8+ Gäste' },
  ];

  // ──────────────────────────────────────────────────────────────────────
  //  Karten-Stil (Layout 1) — interaktive Vorschau
  //  Datum, Uhrzeit & Personenanzahl teilen sich den State mit dem
  //  Planer-Stil (plannerSelectedDay/Time/Seats), damit man beim Layout-
  //  Wechsel die gleiche Auswahl sieht. Zusätzlich gibt es hier ein
  //  Inline-Picker-Panel, das je nach Klick auf Datum/Uhrzeit/Personen
  //  unter den Feldern aufklappt.
  // ──────────────────────────────────────────────────────────────────────

  /** Aktuell geöffnetes Picker-Panel im Karten-Stil — null = zu. */
  readonly cardOpenPicker = signal<'date' | 'time' | 'seats' | null>(null);

  /** Picker auf-/zuklappen. Klick auf das gleiche Feld schließt den Picker. */
  cardTogglePicker(picker: 'date' | 'time' | 'seats'): void {
    this.cardOpenPicker.set(this.cardOpenPicker() === picker ? null : picker);
  }

  /** Schließt alle Picker (z. B. nach Auswahl eines Wertes). */
  cardClosePicker(): void {
    this.cardOpenPicker.set(null);
  }

  /** −-Button im Personen-Stepper. Klemmt bei 1 (Untergrenze). */
  cardDecSeats(): void {
    const next = Math.max(1, this.plannerSelectedSeats() - 1);
    this.plannerSelectedSeats.set(next);
  }

  /** +-Button im Personen-Stepper. Klemmt bei 20 (Obergrenze, sinnvoller Default). */
  cardIncSeats(): void {
    const next = Math.min(20, this.plannerSelectedSeats() + 1);
    this.plannerSelectedSeats.set(next);
  }

  /**
   * Tag im Karten-Picker wählen — speichert Datum & schließt das Panel.
   * (Kein Auto-Advance wie im Planer-Stil — der Karten-Stil hat keine Steps.)
   */
  cardSelectDay(day: number): void {
    this.plannerSelectedDay.set(day);
    this.cardClosePicker();
  }

  /** Uhrzeit im Karten-Picker wählen — speichert & schließt. */
  cardSelectTime(label: string): void {
    this.plannerSelectedTime.set(label);
    this.cardClosePicker();
  }

  /** Personenzahl im Karten-Picker wählen — speichert & schließt. */
  cardSelectSeats(count: number): void {
    this.plannerSelectedSeats.set(count);
    this.cardClosePicker();
  }

  /**
   * Zwei-Schritt-Flow im Karten-Stil:
   *   1 — Personen + Datum + Uhrzeit + "Reservieren"-Button
   *   2 — Vorname / Nachname / Telefon / E-Mail / Notizen + "Senden"
   * Der Klick auf den Reservieren-Button (Schritt 1) öffnet Schritt 2,
   * von dort kann man via Zurück-Button wieder zurück.
   */
  readonly cardStep = signal<1 | 2>(1);
  cardNextStep(): void {
    this.cardClosePicker();   // offenes Picker-Panel zumachen
    this.cardStep.set(2);
  }
  cardPrevStep(): void { this.cardStep.set(1); }

  /**
   * DSGVO-Einwilligung: muss in Schritt 2 explizit gesetzt sein, bevor
   * personenbezogene Daten (Name, Telefon, E-Mail) gespeichert werden dürfen.
   * Steuert auch den disabled-Look des „Reservierung absenden"-Buttons.
   */
  readonly cardConsent = signal<boolean>(false);
  cardToggleConsent(): void { this.cardConsent.set(!this.cardConsent()); }

  // ──────────────────────────────────────────────────────────────────────
  //  Hotel-Stil (Layout 2) — Slide-In-Picker („Concierge-Modus")
  //  Anders als beim Karten-Stil ersetzt das Picker-Panel hier die ganze
  //  Card-Übersicht. Beim Klick auf Datum/Uhrzeit/Personen schiebt sich
  //  der Picker von rechts rein, ein „Zurück"-Pfeil bringt einen wieder
  //  zur Übersicht. Auswahl auto-confirmt und schließt das Panel.
  //  Datum, Uhrzeit & Personen teilen sich den State weiter mit Layout 1
  //  und Layout 4 (plannerSelected*).
  // ──────────────────────────────────────────────────────────────────────

  /** Aktiver Sidebar-Picker — null = Übersicht. */
  readonly sidebarOpenPicker = signal<'date' | 'time' | 'seats' | null>(null);

  sidebarTogglePicker(p: 'date' | 'time' | 'seats'): void {
    this.sidebarOpenPicker.set(this.sidebarOpenPicker() === p ? null : p);
  }
  sidebarClosePicker(): void { this.sidebarOpenPicker.set(null); }

  sidebarSelectDay(day: number): void {
    this.plannerSelectedDay.set(day);
    this.sidebarClosePicker();
  }
  sidebarSelectTime(label: string): void {
    this.plannerSelectedTime.set(label);
    this.sidebarClosePicker();
  }
  sidebarSelectSeats(count: number): void {
    this.plannerSelectedSeats.set(count);
    this.sidebarClosePicker();
  }

  /**
   * Hotel-Stil 2-Schritt-Flow:
   *   1 — Datum / Uhrzeit / Personen + Reservieren-Button
   *   2 — Vorname, Nachname, Telefon, E-Mail, Notizen + DSGVO-Checkbox + Senden
   */
  readonly sidebarStep    = signal<1 | 2>(1);
  readonly sidebarConsent = signal<boolean>(false);

  sidebarNextStep(): void {
    this.sidebarClosePicker();   // falls noch ein Picker offen war
    this.sidebarStep.set(2);
  }
  sidebarPrevStep(): void { this.sidebarStep.set(1); }
  sidebarToggleConsent(): void { this.sidebarConsent.set(!this.sidebarConsent()); }

  // ──────────────────────────────────────────────────────────────────────
  //  Klassisch / „Cockpit"-Stil (Layout 3) — interaktive Vorschau
  //  Eigenes Erscheinungsbild, das sich von Layouts 1, 2 und 4 abhebt:
  //    • Oben eine „Live"-Statusleiste (pulsender Dot + Schritt-Indikator).
  //    • Drei große Cockpit-Tiles für Datum / Uhrzeit / Personen — mit
  //      großem Wert oben und Caps-Label darunter.
  //    • Klick auf eine Tile = primärfarbener Active-State + Slide-Down-
  //      Picker, der UNTER den Tiles ausfährt (Layout 1 öffnet oben,
  //      Layout 2 schiebt von rechts rein, Layout 3 fährt nach unten aus —
  //      alle drei sind klar voneinander unterscheidbar).
  //  Datum/Uhrzeit/Personen teilen sich den State mit Layout 1, 2 und 4.
  // ──────────────────────────────────────────────────────────────────────

  /** Aktiver Picker im Klassik-Stil — null = keiner offen. */
  readonly stackedOpenPicker = signal<'date' | 'time' | 'seats' | null>(null);

  stackedTogglePicker(p: 'date' | 'time' | 'seats'): void {
    this.stackedOpenPicker.set(this.stackedOpenPicker() === p ? null : p);
  }
  stackedClosePicker(): void { this.stackedOpenPicker.set(null); }

  stackedSelectDay(day: number): void {
    this.plannerSelectedDay.set(day);
    this.stackedClosePicker();
  }
  stackedSelectTime(label: string): void {
    this.plannerSelectedTime.set(label);
    this.stackedClosePicker();
  }
  stackedSelectSeats(count: number): void {
    this.plannerSelectedSeats.set(count);
    this.stackedClosePicker();
  }

  /**
   * Klassik-Stil 2-Schritt-Flow:
   *   1 — Datum / Uhrzeit / Personen + „Reservieren"-CTA
   *   2 — Vorname, Nachname, Telefon, E-Mail, Notizen + DSGVO-Checkbox + Senden
   */
  readonly stackedStep    = signal<1 | 2>(1);
  readonly stackedConsent = signal<boolean>(false);

  stackedNextStep(): void {
    this.stackedClosePicker();   // offenen Picker schließen, bevor Schritt 2 öffnet
    this.stackedStep.set(2);
  }
  stackedPrevStep(): void { this.stackedStep.set(1); }
  stackedToggleConsent(): void { this.stackedConsent.set(!this.stackedConsent()); }

  /** Kurzes Datums-Label im Cockpit-Tile: „02 MAI" (Tag + Monatskürzel). */
  readonly stackedShortDateLabel = computed(() => {
    const day = this.plannerSelectedDay().toString().padStart(2, '0');
    const months = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN',
                    'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];
    return { day, month: months[this.plannerCalendarMonth()] };
  });

  // ──────────────────────────────────────────────────────────────────────
  //  02  Bild (nur für Karten- & Hotel-Stil)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Bild-URL für die Vorschau. Wird im Karten-Stil als Hero-Foto und im
   * Hotel-Stil als Hintergrund eingesetzt. Gespeichert als relativer Pfad
   * z.B. /uploads/widget/{tenantId}/{filename}.
   */
  readonly imageUrl        = signal<string | null>(null);
  readonly imageUploading  = signal<boolean>(false);
  readonly imageUploadError = signal<string | null>(null);

  /** Datei-Upload an den Backend-Endpoint senden. */
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.imageUploadError.set(this.translate.instant('widget.upload_size_error'));
      input.value = '';
      return;
    }

    this.imageUploadError.set(null);
    this.imageUploading.set(true);

    const body = new FormData();
    body.append('image', file);

    this.http.post<{ url: string }>('/api/v1/admin/upload/image', body).subscribe({
      next: (res) => {
        this.imageUrl.set(res.url);
        this.imageUploading.set(false);
      },
      error: (err) => {
        const msg = err?.error?.error ?? this.translate.instant('widget.upload_error');
        this.imageUploadError.set(msg);
        this.imageUploading.set(false);
      },
    });

    // Damit dasselbe File auch nochmal gewählt werden kann
    input.value = '';
  }

  clearImage(): void {
    this.imageUrl.set(null);
    this.imageUploadError.set(null);
  }

  // ──────────────────────────────────────────────────────────────────────
  //  03  Überschrift / Texte
  // ──────────────────────────────────────────────────────────────────────
  readonly headingTitle    = signal<string>('Tisch reservieren');
  readonly headingSubtitle = signal<string>('bei Restaurant');

  readonly alignmentOptions: AlignmentOption[] = [
    { key: 'left',   label: 'widget.align_left',   icon: 'format_align_left'   },
    { key: 'center', label: 'widget.align_center',  icon: 'format_align_center' },
    { key: 'right',  label: 'widget.align_right',   icon: 'format_align_right'  },
  ];
  readonly headingAlignment = signal<TextAlignment>('center');
  setHeadingAlignment(a: TextAlignment): void { this.headingAlignment.set(a); }

  /** Soll der Untertitel überhaupt gezeigt werden? */
  readonly showSubtitle = signal<boolean>(true);

  // ──────────────────────────────────────────────────────────────────────
  //  03  Typografie
  // ──────────────────────────────────────────────────────────────────────
  readonly fontFamilyOptions: FontFamilyOption[] = [
    { key: 'system',  label: 'widget.font_system',  stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', hint: 'widget.font_system_hint' },
    { key: 'modern',  label: 'widget.font_modern',  stack: '"Trebuchet MS", "Lucida Sans Unicode", "Lucida Grande", sans-serif', hint: 'widget.font_modern_hint' },
    { key: 'classic', label: 'widget.font_classic', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif', hint: 'widget.font_classic_hint' },
    { key: 'serif',   label: 'widget.font_serif',   stack: 'Georgia, "Times New Roman", Times, serif', hint: 'widget.font_serif_hint' },
    { key: 'rounded', label: 'widget.font_rounded', stack: '"Avenir Next", "Avenir", "Nunito", sans-serif', hint: 'widget.font_rounded_hint' },
    { key: 'mono',    label: 'widget.font_mono',    stack: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace', hint: 'widget.font_mono_hint' },
  ];

  readonly fontSizeOptions: FontSizeOption[] = [
    { key: 'compact',  label: 'widget.size_compact',  hint: 'widget.size_compact_hint',  basePx: 12 },
    { key: 'standard', label: 'widget.size_standard', hint: 'widget.size_standard_hint', basePx: 14 },
    { key: 'large',    label: 'widget.size_large',    hint: 'widget.size_large_hint',    basePx: 16 },
  ];

  readonly selectedFontFamily = signal<FontFamilyKey>('system');
  readonly selectedFontSize   = signal<FontSizeKey>('standard');

  setFontFamily(k: FontFamilyKey): void { this.selectedFontFamily.set(k); }
  setFontSize(k: FontSizeKey):   void { this.selectedFontSize.set(k); }

  /** Aktuelles Font-Stack für CSS. */
  readonly currentFontStack = computed(() =>
    this.fontFamilyOptions.find(o => o.key === this.selectedFontFamily())?.stack
    ?? this.fontFamilyOptions[0].stack);

  /** Aktuelle Basisgröße in px. */
  readonly currentBasePx = computed(() =>
    this.fontSizeOptions.find(o => o.key === this.selectedFontSize())?.basePx
    ?? 14);

  // ──────────────────────────────────────────────────────────────────────
  //  04  Farben
  // ──────────────────────────────────────────────────────────────────────
  /** Akzent-/Markenfarbe — Hintergrund des CTA-Buttons. */
  readonly colorPrimary    = signal<string>('#2563eb');
  /** Haupttext im Widget. */
  readonly colorText       = signal<string>('#1f2937');
  /** Hintergrund-Karte des Widgets. */
  readonly colorBackground = signal<string>('#ffffff');

  /** Schnellauswahl-Paletten für die Markenfarbe. */
  readonly primaryPresets: string[] = [
    '#2563eb', // Blau (Default)
    '#0f172a', // Schwarz/Slate
    '#0ea5e9', // Hellblau
    '#16a34a', // Grün
    '#f59e0b', // Amber
    '#dc2626', // Rot
    '#9333ea', // Violett
    '#db2777', // Pink
  ];

  /** Schnellauswahl-Paletten für die Textfarbe. */
  readonly textPresets: string[] = [
    '#1f2937', // Dunkelgrau (Default)
    '#000000', // Schwarz
    '#111827', // Fast Schwarz
    '#374151', // Mittelgrau
    '#6b7280', // Hellgrau
    '#ffffff', // Weiß
    '#f9fafb', // Fast Weiß
    '#e5e7eb', // Hellgrau/Weiß
  ];

  /** Schnellauswahl-Paletten für die Karten-Farbe. */
  readonly backgroundPresets: string[] = [
    '#ffffff', // Weiß
    '#f9fafb', // Sehr helles Grau
    '#f3f4f6', // Helles Grau
    '#fefce8', // Cremegelb
    '#0f172a', // Dunkel (Dark Mode)
    '#1e293b', // Dunkel-Slate
  ];

  /** Hintergrundfarbe der Widget-Kachel. */
  readonly cardBackground = signal<string>('#ffffff');
  /** Seiten-Hintergrund: Farbe oder Bild. */
  readonly pageBackground = signal<PageBackground>({ type: 'color', value: '#f4f5f7' });

  /** Presets für Kachel- und Seiten-Hintergrund. */
  readonly cardBgPresets: string[] = [
    '#ffffff', '#f9fafb', '#f3f4f6', '#fefce8',
    '#0f172a', '#1e293b', '#1a1a2e', '#111827',
  ];
  readonly pageBgPresets: string[] = [
    '#f4f5f7', '#ffffff', '#e2e8f0', '#fef9ef',
    '#0a0a0a', '#0f172a', '#1e293b', '#18181b',
  ];

  /** Upload-State für Seiten-Hintergrundbild. */
  readonly pageBgUploading  = signal<boolean>(false);
  readonly pageBgUploadError = signal<string | null>(null);

  setColorPrimary(c: string):    void { this.colorPrimary.set(c); }
  setColorText(c: string):       void { this.colorText.set(c); }
  setColorBackground(c: string): void { this.colorBackground.set(c); }
  setCardBackground(c: string):  void { this.cardBackground.set(c); }

  setPageBgType(t: PageBackgroundType): void {
    // Bei Wechsel zu 'image' value leeren, damit der Upload-Dropzone erscheint
    const currentValue = this.pageBackground().value;
    const newValue = t === 'image' ? '' : (currentValue || '#f4f5f7');
    this.pageBackground.set({ type: t, value: newValue });
    this.pageBgUploadError.set(null);
  }
  setPageBgColor(c: string): void {
    this.pageBackground.set({ type: 'color', value: c });
  }

  onPageBgImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.pageBgUploadError.set(this.translate.instant('widget.upload_size_error'));
      input.value = '';
      return;
    }
    this.pageBgUploadError.set(null);
    this.pageBgUploading.set(true);
    const body = new FormData();
    body.append('image', file);
    this.http.post<{ url: string }>('/api/v1/admin/upload/image', body).subscribe({
      next: (res) => {
        this.pageBackground.set({ type: 'image', value: res.url });
        this.pageBgUploading.set(false);
      },
      error: (err) => {
        this.pageBgUploadError.set(err?.error?.error ?? this.translate.instant('widget.upload_error'));
        this.pageBgUploading.set(false);
      },
    });
    input.value = '';
  }

  clearPageBgImage(): void {
    this.pageBackground.set({ type: 'image', value: '' });
    this.pageBgUploadError.set(null);
  }

  /**
   * Berechnet einen lesbaren Muted-/Border-/Soft-Ton, je nachdem ob die
   * Karte einen hellen oder dunklen Hintergrund hat.
   * Reine Vorschau-Logik, beeinflusst die echte Einstellung nicht.
   */
  readonly previewMutedColor = computed(() =>
    this.isDarkBackground() ? 'rgba(255,255,255,0.6)' : '#6b7280');

  readonly previewBorderColor = computed(() =>
    this.isDarkBackground() ? 'rgba(255,255,255,0.14)' : '#e5e7eb');

  readonly previewSoftColor = computed(() =>
    this.isDarkBackground() ? 'rgba(255,255,255,0.06)' : '#f9fafb');

  /** Prüft, ob die Karte einen "dunklen" Hintergrund hat. */
  private isDarkBackground(): boolean {
    const hex = this.colorBackground().replace('#', '');
    if (hex.length !== 6) return false;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    // Wahrgenommene Helligkeit (Rec. 601)
    const luma = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    return luma < 0.5;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  05  Button
  // ──────────────────────────────────────────────────────────────────────
  readonly buttonLabel  = signal<string>('Reservieren');

  readonly radiusOptions: RadiusOption[] = [
    { key: 'square', label: 'widget.radius_square', px: 4   },
    { key: 'soft',   label: 'widget.radius_soft',   px: 10  },
    { key: 'pill',   label: 'widget.radius_pill',   px: 999 },
  ];
  readonly selectedRadius = signal<CornerRadiusKey>('soft');
  setRadius(k: CornerRadiusKey): void { this.selectedRadius.set(k); }

  readonly currentRadiusPx = computed(() =>
    this.radiusOptions.find(o => o.key === this.selectedRadius())?.px ?? 10);

  // ──────────────────────────────────────────────────────────────────────
  //  Vorschau-Style — wird als ngStyle an `.preview` gebunden, damit alle
  //  Einstellungen live durchschlagen.
  // ──────────────────────────────────────────────────────────────────────
  readonly previewStyle = computed<Record<string, string>>(() => {
    const radius = this.currentRadiusPx();
    const pb = this.pageBackground();
    const pageBgStyle = pb.type === 'image' && pb.value
      ? `url(${pb.value}) center/cover no-repeat`
      : pb.value;
    return {
      '--preview-text':        this.colorText(),
      '--preview-bg':          this.colorBackground(),
      '--preview-card-bg':     this.cardBackground(),
      '--preview-page-bg':     pb.type === 'color' ? pb.value : 'transparent',
      '--preview-page-image':  pb.type === 'image' && pb.value ? `url(${pb.value})` : 'none',
      '--preview-primary':     this.colorPrimary(),
      '--preview-muted':       this.previewMutedColor(),
      '--preview-border':      this.previewBorderColor(),
      '--preview-soft':        this.previewSoftColor(),
      '--preview-font':        this.currentFontStack(),
      '--preview-base':        `${this.currentBasePx()}px`,
      '--preview-radius':      `${Math.min(radius, 14)}px`,
      '--preview-radius-cta':  `${radius}px`,
      // Seiten-Hintergrund direkt am Preview-Wrapper
      'background':            pageBgStyle,
      // font-family/size am Wrapper, damit alle Layouts inheriten
      'font-family':           this.currentFontStack(),
      'font-size':             `${this.currentBasePx()}px`,
    };
  });

  // ──────────────────────────────────────────────────────────────────────
  //  Speichern + Reset
  // ──────────────────────────────────────────────────────────────────────
  readonly savedFlash  = signal<boolean>(false);
  readonly saveError   = signal<string | null>(null);
  readonly isSaving    = signal<boolean>(false);

  save(): void {
    this.saveError.set(null);
    this.isSaving.set(true);
    this.widgetDesign.save({
      layout:           this.selectedLayout(),
      imageUrl:         this.imageUrl(),
      headingTitle:     this.headingTitle(),
      headingSubtitle:  this.headingSubtitle(),
      headingAlignment: this.headingAlignment(),
      showSubtitle:     this.showSubtitle(),
      fontFamily:       this.selectedFontFamily(),
      fontSize:         this.selectedFontSize(),
      colorPrimary:     this.colorPrimary(),
      colorText:        this.colorText(),
      colorBackground:  this.colorBackground(),
      cardBackground:   this.cardBackground(),
      pageBackground:   this.pageBackground(),
      buttonLabel:      this.buttonLabel(),
      cornerRadius:     this.selectedRadius(),
    }).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.savedFlash.set(true);
        setTimeout(() => this.savedFlash.set(false), 1800);
      },
      error: (err) => {
        this.isSaving.set(false);
        const msg = err?.error?.detail ?? err?.message ?? 'Einstellungen konnten nicht gespeichert werden.';
        this.saveError.set(msg);
        setTimeout(() => this.saveError.set(null), 5000);
      },
    });
  }

  resetAll(): void {
    const d = DEFAULT_WIDGET_DESIGN;
    // Persistente Einstellungen zurücksetzen
    this.selectedLayout.set(d.layout);
    this.imageUrl.set(d.imageUrl);
    this.headingTitle.set(d.headingTitle);
    this.headingSubtitle.set(d.headingSubtitle);
    this.headingAlignment.set(d.headingAlignment);
    this.showSubtitle.set(d.showSubtitle);
    this.selectedFontFamily.set(d.fontFamily);
    this.selectedFontSize.set(d.fontSize);
    this.colorPrimary.set(d.colorPrimary);
    this.colorText.set(d.colorText);
    this.colorBackground.set(d.colorBackground);
    this.cardBackground.set(d.cardBackground);
    this.pageBackground.set(d.pageBackground);
    this.buttonLabel.set(d.buttonLabel);
    this.selectedRadius.set(d.cornerRadius);
    this.widgetDesign.reset();

    // Ephemerer UI-State (Preview-Interaktion, nicht persistiert)
    this.plannerStep.set(1);
    this.plannerSelectedDay.set(2);
    this.plannerSelectedTime.set('19:00');
    this.plannerSelectedSeats.set(2);
    this.plannerConsent.set(false);
    this.cardStep.set(1);
    this.cardOpenPicker.set(null);
    this.cardConsent.set(false);
    this.sidebarOpenPicker.set(null);
    this.sidebarStep.set(1);
    this.sidebarConsent.set(false);
    this.stackedOpenPicker.set(null);
    this.stackedStep.set(1);
    this.stackedConsent.set(false);
  }
}
