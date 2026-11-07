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
  WidgetVenue,
  DayAvailability,
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

  // ─── Heute als Vorbelegung & Mindestdatum ────────────────────────────────
  readonly today = new Date().toISOString().slice(0, 10);

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

  readonly weekdays: readonly string[] = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  readonly seatOptions: readonly { count: number; label: string }[] = [
    { count: 1, label: '1 Gast'   },
    { count: 2, label: '2 Gäste'  },
    { count: 3, label: '3 Gäste'  },
    { count: 4, label: '4 Gäste'  },
    { count: 5, label: '5 Gäste'  },
    { count: 6, label: '6 Gäste'  },
    { count: 7, label: '7 Gäste'  },
    { count: 8, label: '8+ Gäste' },
  ];

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
  plannerStep    = signal<1 | 2 | 3 | 4>(1);
  plannerConsent = signal(false);

  // ─── Öffnungszeiten — via toObservable + switchMap ────────────────────────
  readonly availability = toSignal<DayAvailability | null>(
    combineLatest([
      toObservable(this.selectedVenue),
      toObservable(this.date),
    ]).pipe(
      switchMap(([venue, date]) => {
        if (!venue || !date) {
          return of<DayAvailability>({ open: true, open_time: null, close_time: null, breaks: [], reason: null });
        }
        return this.reservations.checkAvailability(venue.id, date);
      }),
    ),
    { initialValue: null },
  );

  readonly isClosedDay = computed(() => this.availability()?.open === false);

  readonly showMaxPersonenWarning = computed(() => this.people() >= this.maxPeople());

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
    const avail = this.availability();
    if (avail?.open === false) return [];
    const from   = avail?.open_time  ?? DEFAULT_FROM;
    const to     = avail?.close_time ?? DEFAULT_TO;
    const breaks = avail?.breaks     ?? [];
    return buildSlots(from, to, this.stepMinutes(), breaks);
  });

  readonly validTime = computed(() => {
    const slots = this.timeSlots();
    const t = this.time();
    if (slots.length === 0) return '';
    return slots.includes(t) ? t : slots[0];
  });

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
      !!this.validTime() &&
      !this.isClosedDay() &&
      !this.showMaxPersonenWarning() &&
      this.people() >= this.minPeople &&
      this.guestName().trim().length >= 2 &&
      this.emailLooksOk() &&
      (!req.includes('phone') || this.guestPhone().trim().length > 0) &&
      (!req.includes('notes') || this.notes().trim().length > 0) &&
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
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === y && today.getMonth() === m;
    const todayDay = today.getDate();
    const sel = this.selectedDay();
    const cells: { day: number | null; isToday: boolean; isSelected: boolean }[] = [];
    for (let i = 0; i < monthStartWeekday; i++) cells.push({ day: null, isToday: false, isSelected: false });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, isToday: isCurrentMonth && d === todayDay, isSelected: d === sel });
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
    const m = (this.calendarMonth() + 1).toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    this.date.set(`${this.calendarYear()}-${m}-${d}`);
  }

  // ─── Card methods ─────────────────────────────────────────────────────────
  cardTogglePicker(p: 'date' | 'time' | 'seats'): void {
    this.cardOpenPicker.set(this.cardOpenPicker() === p ? null : p);
  }
  cardClosePicker(): void { this.cardOpenPicker.set(null); }
  cardNextStep(): void { this.cardClosePicker(); this.cardStep.set(2); }
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
  sidebarNextStep(): void { this.sidebarClosePicker(); this.sidebarStep.set(2); }
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
  stackedNextStep(): void { this.stackedClosePicker(); this.stackedStep.set(2); }
  stackedPrevStep(): void { this.stackedStep.set(1); }
  stackedToggleConsent(): void { this.stackedConsent.update(v => !v); }
  stackedSelectDay(day: number): void { this.selectDay(day); this.stackedClosePicker(); }
  stackedSelectTime(t: string): void { this.time.set(t); this.stackedClosePicker(); }
  stackedSelectSeats(n: number): void { this.people.set(n); this.stackedClosePicker(); }

  // ─── Planner methods ──────────────────────────────────────────────────────
  setPlannerStep(s: 1 | 2 | 3 | 4): void { this.plannerStep.set(s); }
  plannerPrev(): void {
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
  selectPlannerSeats(n: number): void { this.people.set(n); this.setPlannerStep(4); }

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
  }

  private loadConfig(publicKey: string): void {
    this.reservations.loadConfig(publicKey).subscribe(config => {
      this.restaurantName.set(config.name);
      this.venues.set(config.venues);
      this.applyDesign(config.widgetDesign);
      this.applyFunctional(config.widgetFunctional);

      const filtered = this.filteredVenues();
      if (filtered.length === 1) {
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
      if (func.hinweistext) this.hinweisOpen.set(true);
    }
    if (func.hinweistextUeberschrift != null)          this.hinweistextUeberschrift.set(func.hinweistextUeberschrift);
    if (func.hinweistextInhalt != null)                this.hinweistextInhalt.set(func.hinweistextInhalt);
    if (func.hinweistextFooter != null)                this.hinweistextFooter.set(func.hinweistextFooter);
    if (func.maxPersonenText != null)                  this.maxPersonenText.set(func.maxPersonenText);
    if (func.maxPersonenPhone != null)                 this.maxPersonenPhone.set(func.maxPersonenPhone);
    if (func.maxPersonenEmail != null)                 this.maxPersonenEmail.set(func.maxPersonenEmail);
    if (typeof func.raumauswahl === 'boolean')         this.raumauswahl.set(func.raumauswahl);
    if (Array.isArray(func.raumauswahlAktiveIds))      this.raumauswahlAktiveIds.set(func.raumauswahlAktiveIds);
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

  onTimeChange(val: string): void {
    this.time.set(val);
  }

  weiter(): void {
    if (!this.canSubmit()) return;

    const venue = this.selectedVenue()!;
    const time  = this.validTime();
    this.state.set('submitting');
    this.errorMessage.set('');

    this.reservations.create({
      venue_id:    venue.id,
      guest_name:  this.guestName().trim(),
      guest_email: this.guestEmail().trim(),
      guest_phone: this.guestPhone().trim() || undefined,
      party_size:  this.people(),
      starts_at:   toAtomDateTime(this.date(), time),
      notes:       this.notes().trim() || undefined,
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
    if (this.venues().length > 1) this.selectedVenue.set(null);
  }

  formatDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }
}
