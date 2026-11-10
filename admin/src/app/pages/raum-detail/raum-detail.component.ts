import { Component, computed, effect, HostListener, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule, MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, of, startWith, switchMap, take } from 'rxjs';
import { RoomsService } from '../../services/rooms.service';
import { FloorReservationsService } from '../../services/floor-reservations.service';
import { ReservationsService } from '../../services/reservations.service';
import { StatusColorsService } from '../../services/status-colors.service';
import { ReservationTimingService } from '../../services/reservation-timing.service';
import { GuestsService, Guest } from '../../services/guests.service';
import { TenantSettingsService, ConfigItem } from '../../services/tenant-settings.service';
import { OpeningHoursService, DayHours } from '../../services/opening-hours.service';
import { PlacedTable, TableType, DecorType, SavedRoom } from '../../services/room.types';
import { FloorReservation, FloorReservationStatus, STATUS_LABELS } from '../../services/floor-reservation.types';
import { Reservation } from '../../services/reservation.types';
import { StatusIconComponent } from '../../shared/status-icon/status-icon.component';
import { GetraenkeReminderService } from '../../services/getraenke-reminder.service';
import { TranslateModule } from '@ngx-translate/core';

type StatusFilter = 'all' | 'active' | FloorReservationStatus;

@Component({
  selector: 'app-raum-detail',
  standalone: true,
  imports: [
    MatIconModule,
    MatDatepickerModule,
    MatInputModule,
    MatFormFieldModule,
    RouterLink,
    FormsModule,
    StatusIconComponent,
    DatePipe,
    TranslateModule,
  ],
  templateUrl: './raum-detail.component.html',
  styleUrl: './raum-detail.component.scss'
})
export class RaumDetailComponent implements OnInit {
  private readonly roomsService        = inject(RoomsService);
  private readonly reservationsService = inject(FloorReservationsService);
  private readonly apiReservations     = inject(ReservationsService);
  private readonly statusColors        = inject(StatusColorsService);
  private readonly timing              = inject(ReservationTimingService);
  private readonly guestsService       = inject(GuestsService);
  private readonly tenantSettings      = inject(TenantSettingsService);
  private readonly ohService           = inject(OpeningHoursService);
  private readonly route               = inject(ActivatedRoute);
  private readonly router              = inject(Router);
  readonly getraenke                   = inject(GetraenkeReminderService);

  // ── Timeline-Übersicht ────────────────────────────────────────────────────
  showTimeline = signal(false);

  // 24px pro 30-Min-Slot
  readonly tlSlotPx = 24;

  // Vollständige Öffnungszeiten – gesetzt sobald die API antwortet
  allDayHours = signal<DayHours[]>([]);

  // Dynamische Start-/Endstunde: exakt der früheste/späteste Öffnungszeitraum, kein Puffer
  get tlStartH(): number {
    const open = this.allDayHours().filter(d => d.open && d.open_time);
    if (!open.length) return 8;
    return Math.min(...open.map(d => parseInt(d.open_time!.split(':')[0])));
  }

  get tlEndH(): number {
    const open = this.allDayHours().filter(d => d.open && d.close_time);
    if (!open.length) return 23;
    // Runde auf die nächste volle Stunde auf falls close_time nicht auf der Stunde liegt
    return Math.min(24, Math.max(...open.map(d => {
      const [h, m] = d.close_time!.split(':').map(Number);
      return m > 0 ? h + 1 : h;
    })));
  }

  get tlTotalPx(): number {
    return (this.tlEndH - this.tlStartH) * 2 * this.tlSlotPx;
  }

  /** Gesamtzahl der 30-Min-Slots im sichtbaren Bereich */
  get tlTotalSlots(): number {
    return (this.tlEndH - this.tlStartH) * 2;
  }

  // Stunden-Markierungen für die Achse (von Start bis End inkl.) — prozentual
  get tlHourMarkers(): { label: string; pct: number }[] {
    const total = this.tlTotalSlots;
    const markers: { label: string; pct: number }[] = [];
    for (let h = this.tlStartH; h <= this.tlEndH; h++) {
      markers.push({
        label: `${String(h).padStart(2, '0')}:00`,
        pct: (h - this.tlStartH) * 2 / total * 100,
      });
    }
    return markers;
  }

  get tlSlots(): string[] {
    const a: string[] = [];
    for (let h = this.tlStartH; h < this.tlEndH; h++) {
      a.push(`${String(h).padStart(2,'0')}:00`);
      a.push(`${String(h).padStart(2,'0')}:30`);
    }
    return a;
  }

  // Öffnungszeitraum des gewählten Tages in Pixeln (für Hintergrund-Hervorhebung)
  readonly selectedDayHours = computed<DayHours | null>(() => {
    const [y, mo, d] = this.selectedDate().split('-').map(Number);
    const weekday = (new Date(y, mo - 1, d).getDay() + 6) % 7;
    return this.allDayHours().find(h => h.weekday === weekday) ?? null;
  });

  readonly tlOpenPx = computed<{ from: number; to: number } | null>(() => {
    const dh = this.selectedDayHours();
    if (!dh?.open || !dh.open_time || !dh.close_time) return null;
    const [oh, om] = dh.open_time.split(':').map(Number);
    const [ch, cm] = dh.close_time.split(':').map(Number);
    const from = ((oh - this.tlStartH) * 60 + om) / 30 * this.tlSlotPx;
    const to   = ((ch - this.tlStartH) * 60 + cm) / 30 * this.tlSlotPx;
    return { from: Math.max(0, from), to: Math.min(this.tlTotalPx, to) };
  });

  /** Öffnungszeiten-Zone in Prozent der Spalten-Höhe */
  readonly tlOpenPct = computed<{ from: number; to: number } | null>(() => {
    const px = this.tlOpenPx();
    if (!px) return null;
    const total = this.tlTotalPx;
    return { from: px.from / total * 100, to: px.to / total * 100 };
  });

  /** True wenn das angezeigte Datum vor heute liegt */
  readonly isSelectedDatePast = computed(() => this.selectedDate() < this.todayIso());

  activeResForTable(tableId: number): FloorReservation[] {
    // Alle Status anzeigen — auch cancelled/no-show/completed, auch heute.
    // Abgeblendet werden sie per isResHistoric() + CSS.
    return this.allReservationsForDay().filter(r => {
      const ids = r.tableIds?.length ? r.tableIds : (r.tableId ? [r.tableId] : []);
      return ids.includes(tableId);
    });
  }

  /**
   * Reservation ist "historisch" → abgeblendet + gestreift.
   * Gilt für: alle RVs auf vergangenen Tagen ODER
   *           abgeschlossene/stornierte/no-show auf heutigem/zukünftigem Tag.
   */
  isResHistoric(res: FloorReservation): boolean {
    if (this.isSelectedDatePast()) return true;
    return res.status === 'cancelled' || res.status === 'no-show' || res.status === 'completed';
  }

  resBlockTop(res: FloorReservation): number {
    const [h, m] = res.time.split(':').map(Number);
    return ((h - this.tlStartH) * 60 + m) / 30 * this.tlSlotPx;
  }

  resBlockHeight(res: FloorReservation): number {
    return Math.max(this.tlSlotPx, res.durationMinutes / 30 * this.tlSlotPx);
  }

  /** Reservierungs-Top in % der Spalten-Höhe */
  resBlockTopPct(res: FloorReservation): number {
    return this.resBlockTop(res) / this.tlTotalPx * 100;
  }

  /** Reservierungs-Höhe in % der Spalten-Höhe (mind. 1 Slot = 1/tlTotalSlots) */
  resBlockHeightPct(res: FloorReservation): number {
    return this.resBlockHeight(res) / this.tlTotalPx * 100;
  }

  readonly tlNowPx = computed(() => {
    if (this.selectedDate() !== this.todayIsoPublic()) return -1;
    const now = new Date(this.now());
    const h = now.getHours(); const m = now.getMinutes();
    if (h < this.tlStartH || h >= this.tlEndH) return -1;
    return ((h - this.tlStartH) * 60 + m) / 30 * this.tlSlotPx;
  });

  /** Jetzt-Linie in % der Spalten-Höhe (-1 = nicht anzeigen) */
  readonly tlNowPct = computed(() => {
    const px = this.tlNowPx();
    if (px < 0) return -1;
    return px / this.tlTotalPx * 100;
  });

  readonly freeSlotsToday = computed(() => {
    const tables = this.room()?.tables ?? [];
    if (!tables.length) return [];
    const result: Array<{time: string; freeCount: number}> = [];
    for (const slot of this.tlSlots) {
      const [sh, sm] = slot.split(':').map(Number);
      const sStart = sh * 60 + sm;
      const sEnd   = sStart + 30;
      const free = tables.filter(t => {
        return !this.activeResForTable(t.id).some(r => {
          const [rh, rm] = r.time.split(':').map(Number);
          const rStart = rh * 60 + rm;
          return rStart < sEnd && (rStart + r.durationMinutes) > sStart;
        });
      }).length;
      if (free > 0) result.push({ time: slot, freeCount: free });
    }
    return result;
  });

  availableGasttypen = signal<ConfigItem[]>([]);
  availableHinweise  = signal<ConfigItem[]>([]);

  readonly STATUS_LABELS = STATUS_LABELS;
  readonly layoutLoading = signal(false);

  /** Personen-Karten: 1–10, darüber → Eingabefeld */
  readonly partyOptions = Array.from({ length: 10 }, (_, i) => i + 1);

  /** Zeitslots basierend auf dem konfigurierten Intervall (08:00–23:30). */
  get timeSlots(): string[] {
    const step = this.tenantSettings.snapshot.widgetFunctional?.intervall ?? 30;
    const slots: string[] = [];
    for (let h = 8; h < 24; h++) {
      for (let m = 0; m < 60; m += step) {
        slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return slots;
  }

  private readonly paramMap = toSignal(this.route.paramMap);

  room = computed(() => {
    const id = this.paramMap()?.get('id');
    return id ? this.roomsService.getRoom(id) : undefined;
  });


  /** Aktueller Timestamp (jede Minute aktualisiert) — für reaktive Minuten-Anzeige. */
  readonly now = this.timing.now;

  /** Wie viele Minuten ist der Gast verspätet? */
  lateMinutes(res: FloorReservation): number {
    return this.timing.lateMinutes(res, this.now());
  }

  /** Wie viele Minuten ist die Reservierungszeit überschritten? */
  expiredMinutes(res: FloorReservation): number {
    return this.timing.expiredMinutes(res, this.now());
  }

  /** Farbe für eine Reservierung — kommt aus dem zentralen StatusColorsService. */
  colorFor(status: FloorReservationStatus): string {
    return this.statusColors.colorForReservation(status);
  }

  /** Icon-ID für eine Reservierung — wird im 'svg'-Anzeigemodus gerendert. */
  iconFor(status: FloorReservationStatus): string {
    return this.statusColors.iconForReservation(status);
  }

  /** Konfiguriertes Status-Label (statt des reinen Lifecycle-Strings). */
  labelFor(status: FloorReservationStatus): string {
    return this.statusColors.labelForReservation(status);
  }

  /**
   * Anzeigemodus für Status (Farbe / Text / Icons).
   * Wird zentral in der Status-Einstellungsseite gesetzt und hier nur gelesen.
   */
  readonly viewMode = this.statusColors.viewMode;

  /** Schwarz/Weiß-Textfarbe je nach Hintergrundhelligkeit (für Text-Badges). */
  textColorFor(hex: string): string {
    if (!hex || !hex.startsWith('#')) return '#fff';
    const c = hex.substring(1);
    const rgb = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 150 ? '#000' : '#fff';
  }

  constructor() {
    // Hauptkalender-Datum → Backend-Sync
    effect(() => {
      const date = this.selectedDate();
      const room = this.room();
      if (room) this.syncFromBackend(room.id, date);
    }, { allowSignalWrites: true });

    // Dialog-Datum → Backend-Sync (kann vom Hauptkalender abweichen)
    effect(() => {
      const date = this.formDate();
      const room = this.room();
      if (room) this.syncFromBackend(room.id, date);
    }, { allowSignalWrites: true });
  }

  /** True, sobald die Venue-Liste vom Backend bestätigt wurde. */
  readonly venuesLoaded = this.roomsService.loaded;

  ngOnInit(): void {
    this.tenantSettings.load().subscribe(s => {
      if (s.gasttypen?.length) this.availableGasttypen.set(s.gasttypen);
      if (s.hinweise?.length)  this.availableHinweise.set(s.hinweise);
    });
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.ohService.getHours(id).subscribe(days => {
      this.allDayHours.set(days);
      this.closedWeekdays.set(days.filter(d => !d.open).map(d => d.weekday));
    });
    this.layoutLoading.set(true);

    // Bei Direktaufruf von /raum/:id ist die Venue-Liste evtl. noch leer,
    // weil sonst nur /raum sie lädt. Erst Räume holen, dann das Layout.
    const ensureRooms$ = this.roomsService.loaded()
      ? of(null)
      : this.roomsService.load();

    ensureRooms$
      .pipe(switchMap(() => this.roomsService.loadRoomLayout(id)))
      .subscribe({
        next:  () => {
          this.layoutLoading.set(false);
          this.syncFromBackend(id, this.selectedDate());
        },
        error: () => this.layoutLoading.set(false),
      });
  }

  private syncFromBackend(venueId: string, date: string): void {
    this.reservationsService.loadForVenue(venueId, date).subscribe({
      error: () => console.warn('Backend-Sync fehlgeschlagen'),
    });
  }

  // ── Öffnungszeiten ────────────────────────────────────────────────────
  closedWeekdays = signal<number[]>([]);

  readonly isSelectedDayClosed = computed(() => {
    const [y, m, d] = this.selectedDate().split('-').map(Number);
    const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7;
    return this.closedWeekdays().includes(weekday);
  });

  readonly dateFilter = (d: Date | null): boolean => {
    if (!d) return true;
    const weekday = (d.getDay() + 6) % 7;
    return !this.closedWeekdays().includes(weekday);
  };

  // ── Reservierungs-State ────────────────────────────────────────────────
  selectedDate   = signal<string>(this.todayIso());
  statusFilter    = signal<StatusFilter>('active');
  filterPanelOpen = signal(false);
  /** Sortierung der Liste nach Uhrzeit: aufsteigend (früh → spät) oder absteigend. */
  sortDir         = signal<'asc' | 'desc'>('asc');

  /** Datum im Neue-Reservierung-Dialog — kann vom Panel-Datum abweichen. */
  formDate     = signal<string>(this.todayIso());
  calendarYear  = signal<number>(new Date().getFullYear());
  calendarMonth = signal<number>(new Date().getMonth()); // 0-indexed

  /**
   * Aktive Reservierungen vom Backend für das aktuell gewählte Dialog-Datum.
   * switchMap cancelt vorherige Requests automatisch, timezone-sicher über JS Date-Timestamps.
   */
  private readonly _backendResForFormDate = toSignal(
    combineLatest([toObservable(this.room), toObservable(this.formDate)]).pipe(
      switchMap(([room, date]) => {
        if (!room || !date) return of<Reservation[]>([]);
        return this.apiReservations.loadForVenue(room.id, date).pipe(
          startWith([] as Reservation[]),
        );
      }),
    ),
  );

  /** Tage-Zellen für den Inline-Kalender (Mo–So, 6 Zeilen = 42 Zellen). */
  readonly calendarDays = computed(() => {
    const y   = this.calendarYear();
    const mon = this.calendarMonth();
    const today = this.todayIso();
    const sel   = this.formDate();

    // Vorausbuchungslimit: wie viele Tage in die Zukunft darf das Admin-Team buchen?
    // Im Admin ohne Limit — wir lassen beliebig weit in die Zukunft zu.
    // Vergangene Tage (vor heute) sind jedoch gesperrt.
    const todayDt = new Date();
    todayDt.setHours(0, 0, 0, 0);

    const firstDow     = (new Date(y, mon, 1).getDay() + 6) % 7; // Mo=0
    const daysInMonth  = new Date(y, mon + 1, 0).getDate();
    const prevMonthLen = new Date(y, mon, 0).getDate();

    const cells: {
      iso: string; day: number; cur: boolean;
      past: boolean; isToday: boolean; sel: boolean; disabled: boolean;
    }[] = [];

    const makeCell = (iso: string, day: number, cur: boolean) => {
      const isPast   = iso < today;
      const isToday  = iso === today;
      return { iso, day, cur, past: isPast, isToday, sel: iso === sel, disabled: isPast };
    };

    // Vormonat auffüllen
    for (let i = firstDow - 1; i >= 0; i--) {
      const d  = prevMonthLen - i;
      const pm = mon === 0 ? 12 : mon;
      const py = mon === 0 ? y - 1 : y;
      const iso = `${py}-${String(pm).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cells.push(makeCell(iso, d, false));
    }

    // Aktueller Monat
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${String(mon+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cells.push(makeCell(iso, d, true));
    }

    // Nächsten Monat auffüllen bis 42 Zellen
    for (let d = 1; cells.length < 42; d++) {
      const nm  = mon === 11 ? 1  : mon + 2;
      const ny  = mon === 11 ? y + 1 : y;
      const iso = `${ny}-${String(nm).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cells.push(makeCell(iso, d, false));
    }

    return cells;
  });

  /** Monats-Label für den Kalender-Header. */
  calendarMonthLabel(): string {
    const names = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    return `${names[this.calendarMonth()]} ${this.calendarYear()}`;
  }

  prevCalendarMonth(): void {
    if (this.calendarMonth() === 0) { this.calendarYear.update(y => y - 1); this.calendarMonth.set(11); }
    else                             { this.calendarMonth.update(m => m - 1); }
  }

  nextCalendarMonth(): void {
    if (this.calendarMonth() === 11) { this.calendarYear.update(y => y + 1); this.calendarMonth.set(0); }
    else                              { this.calendarMonth.update(m => m + 1); }
  }

  /** Tag im Kalender anklicken → formDate setzen. */
  selectCalendarDay(iso: string): void {
    this.formDate.set(iso);
  }

  /**
   * Zeitslots für den Reservierungsdialog.
   * - Vergangene Uhrzeiten werden heute ausgeblendet.
   * - Slots wo alle Tische des Raums bereits belegt sind werden ausgeblendet.
   */
  readonly filteredTimeSlots = computed<string[]>(() => {
    const step     = this.tenantSettings.snapshot.widgetFunctional?.intervall ?? 30;
    const duration = this.formDurationMinutes();
    const formDateVal = this.formDate();

    const all: string[] = [];
    for (let h = 8; h < 24; h++) {
      for (let m = 0; m < 60; m += step) {
        all.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }

    // Vergangene Slots heute ausblenden
    let slots = all;
    if (formDateVal === this.todayIso()) {
      const now = new Date();
      const cur = now.getHours() * 60 + now.getMinutes();
      slots = slots.filter(slot => {
        const [h, m] = slot.split(':').map(Number);
        return h * 60 + m > cur;
      });
    }

    // Vollständig belegte Slots ausblenden
    const room        = this.room();
    const totalTables = room?.tables?.length ?? 0;
    if (totalTables > 0) {
      // Alle lokalen Reservierungen — inkl. bereits bestätigter (backendId gesetzt).
      // Verhindert das "Transition-Window"-Problem, wenn backendId gesetzt wird bevor
      // _backendResForFormDate neu geladen hat.
      const allLocal = room ? this.reservationsService
        .forRoomAndDate(room.id, formDateVal)
        .filter(r => !['cancelled', 'completed'].includes(r.status)) : [];

      // Backend-Reservierungen aus anderen Sessions — nur die, die lokal nicht schon erfasst sind.
      const localBackendIds = new Set(allLocal.map(r => r.backendId).filter((id): id is string => !!id));
      const backendExtra = (this._backendResForFormDate() ?? [])
        .filter(r => !['cancelled', 'completed'].includes(r.status) && !localBackendIds.has(r.id));

      slots = slots.filter(slotTime => {
        const slotStartMs = new Date(`${formDateVal}T${slotTime}:00`).getTime();
        const slotEndMs   = slotStartMs + duration * 60_000;
        let concurrent = 0;

        for (const res of allLocal) {
          const dur        = res.durationMinutes > 0 ? res.durationMinutes : duration;
          const resStartMs = new Date(`${formDateVal}T${res.time}:00`).getTime();
          const resEndMs   = resStartMs + dur * 60_000;
          if (resStartMs < slotEndMs && resEndMs > slotStartMs) concurrent++;
        }
        for (const res of backendExtra) {
          const resStartMs = new Date(res.starts_at).getTime();
          const resEndMs   = new Date(res.ends_at).getTime();
          if (resStartMs < slotEndMs && resEndMs > slotStartMs) concurrent++;
        }

        return concurrent < totalTables;
      });
    }

    return slots;
  });

  // Dialoge
  newDialogOpen       = signal(false);
  editDialogOpen      = signal(false);
  /** Aktueller Schritt im Mobile-Wizard (1–4). Auf Desktop irrelevant. */
  mobileStep          = signal(1);
  readonly mobileStepMax = 4;
  /** Erkennung ob wir auf Mobile sind (≤ 640px) — für [hidden]-Binding. */
  isMobile            = signal(typeof window !== 'undefined' && window.innerWidth <= 640);

  @HostListener('window:resize')
  onResize(): void { this.isMobile.set(window.innerWidth <= 640); }
  tablePickerFor      = signal<string | null>(null);
  editingId           = signal<string | null>(null);
  editingReservation  = signal<FloorReservation | null>(null);
  formError           = signal<string | null>(null);
  formSubmitAttempted = signal(false);

  // Kundenkarte-Modal (Klick auf res-row__body)
  guestCardOpen    = signal(false);
  guestCardRes     = signal<FloorReservation | null>(null);
  gcName           = signal('');
  gcPhone          = signal('');
  gcNotes          = signal('');
  gcBlocked        = signal(false);
  gcReason         = signal('');
  gcGasttypen      = signal<string[]>([]);
  gcHinweise       = signal<string[]>([]);
  gcEmail          = signal('');
  gcSaving         = signal(false);
  gcError          = signal<string | null>(null);
  gcStatusLoading  = signal(false);

  // E-Mail erneut senden aus Gastkarte
  readonly gcMailTemplates = [
    { key: 'confirmation' as const, label: 'Bestätigung',   icon: 'check_circle',  color: '--blue'  },
    { key: 'reminder'     as const, label: 'Erinnerung',    icon: 'notifications', color: '--amber' },
    { key: 'cancel'       as const, label: 'Stornierung',   icon: 'cancel',        color: '--red'   },
    { key: 'no_show'      as const, label: 'No-Show',       icon: 'person_off',    color: '--grey'  },
  ];
  gcMailSelected   = signal<'confirmation' | 'reminder' | 'cancel' | 'no_show' | null>(null);
  gcMailSending    = signal(false);
  gcMailSentOk     = signal(false);
  gcMailError      = signal<string | null>(null);

  sendGcMail(): void {
    const res  = this.guestCardRes();
    const type = this.gcMailSelected();
    if (!res?.guestId || !type || this.gcMailSending()) return;
    this.gcMailSending.set(true);
    this.gcMailSentOk.set(false);
    this.gcMailError.set(null);
    this.guestsService.resendEmail(res.guestId, type, res.backendId ?? undefined).subscribe({
      next: () => {
        this.gcMailSending.set(false);
        this.gcMailSentOk.set(true);
        setTimeout(() => this.gcMailSentOk.set(false), 4000);
      },
      error: err => {
        this.gcMailSending.set(false);
        this.gcMailError.set(err?.error?.error ?? 'E-Mail konnte nicht gesendet werden.');
      },
    });
  }

  openGuestCard(res: FloorReservation): void {
    this.guestCardRes.set(res);
    this.gcName.set(res.guestName);
    this.gcPhone.set(res.phone ?? '');
    this.gcEmail.set(res.guestEmail ?? '');
    this.gcNotes.set(res.guestInternalNotes ?? '');
    this.gcBlocked.set(res.guestBlocked ?? false);
    this.gcReason.set(res.guestBlockedReason ?? '');
    this.gcGasttypen.set([...(res.gasttypen ?? [])]);
    this.gcHinweise.set([...(res.hinweise ?? [])]);
    this.gcError.set(null);
    this.gcMailSelected.set(null);
    this.gcMailSentOk.set(false);
    this.gcMailError.set(null);
    this.guestCardOpen.set(true);
  }

  closeGuestCard(): void { this.guestCardOpen.set(false); }

  /** Schnell-Statuswechsel direkt aus der Gästekarte */
  gcDoStatus(action: string): void {
    const res = this.guestCardRes();
    if (!res || this.gcStatusLoading()) return;
    const newStatus: FloorReservationStatus =
      action === 'reopen'
        ? (res.backendId ? 'confirmed' : 'upcoming')
        : (action as FloorReservationStatus);
    this.gcStatusLoading.set(true);
    this.reservationsService.setStatus(res.id, newStatus);
    this.guestCardRes.set({ ...res, status: newStatus });
    this.gcStatusLoading.set(false);
  }

  /** Gastkarte schließen und direkt den Bearbeitungs-Dialog öffnen. */
  editFromGuestCard(): void {
    const res = this.guestCardRes();
    if (!res) return;
    this.closeGuestCard();
    this.openEditDialog(res);
  }

  toggleGcGasttyp(key: string): void {
    this.gcGasttypen.update(l => l.includes(key) ? l.filter(k => k !== key) : [...l, key]);
  }

  toggleGcHinweis(key: string): void {
    this.gcHinweise.update(l => l.includes(key) ? l.filter(k => k !== key) : [...l, key]);
  }

  saveGuestCard(): void {
    const res = this.guestCardRes();
    if (!res?.guestId || !this.gcName().trim()) return;
    this.gcSaving.set(true);
    this.gcError.set(null);
    this.guestsService.update(res.guestId, {
      name:           this.gcName().trim(),
      phone:          this.gcPhone().trim() || null,
      email:          this.gcEmail().trim() || null,
      internal_notes: this.gcNotes().trim() || null,
      blocked:        this.gcBlocked(),
      blocked_reason: this.gcBlocked() ? this.gcReason().trim() : '',
      gasttypen:      this.gcGasttypen(),
      hinweise:       this.gcHinweise(),
    }).subscribe({
      next: updated => {
        // FloorReservation sofort aktualisieren
        this.reservationsService.update(res.id, {
          guestName:          updated.name,
          phone:              updated.phone ?? undefined,
          guestEmail:         updated.email ?? undefined,
          guestInternalNotes: updated.internal_notes ?? undefined,
          guestBlocked:       updated.blocked,
          guestBlockedReason: updated.blocked_reason ?? undefined,
          gasttypen:          updated.gasttypen,
          hinweise:           updated.hinweise,
        });
        this.gcSaving.set(false);
        this.closeGuestCard();
      },
      error: err => {
        this.gcSaving.set(false);
        this.gcError.set(err?.error?.error ?? 'Fehler beim Speichern.');
      },
    });
  }

  // Gast-Autocomplete
  guestSuggestions  = signal<Guest[]>([]);
  showSuggestions   = signal(false);
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Formular für neue/bearbeitete Reservierung
  form = {
    guestName: '',
    vorname:   '',
    nachname:  '',
    guestEmail: '',
    partySize: 2,
    time: '19:00',
    durationMinutes: 90,
    tableId: 0 as number | 0,
    tableIds: [] as number[],
    phone: '',
    notes: '',
    isWalkIn: false,
  };

  /** Reaktives Signal für die Formulardauer — damit filteredTimeSlots darauf reagiert. */
  readonly formDurationMinutes = signal<number>(90);

  // ── Abgeleitete Listen ────────────────────────────────────────────────
  allReservationsForDay = computed(() => {
    const r = this.room();
    if (!r) return [];
    // reservations-Signal abonnieren, damit computed auf Änderungen reagiert
    this.reservationsService.reservations();
    return this.reservationsService.forRoomAndDate(r.id, this.selectedDate());
  });

  filteredReservations = computed(() => {
    const list = this.allReservationsForDay();
    // Filter-Panel zugeklappt → kein Filter, alle RVs anzeigen
    if (!this.filterPanelOpen()) return list;
    const f = this.statusFilter();
    if (f === 'all') return list;
    // 'active' = alles, was operativ noch im Restaurant ist:
    // Geplant, eingecheckt, Standard-Dauer überschritten ("expired"),
    // oder Tisch wird gerade gereinigt ("cleanup").
    if (f === 'active') return list.filter(r =>
      r.status === 'upcoming' || r.status === 'confirmed' || r.status === 'late' ||
      r.status === 'seated'   || r.status === 'expired'  || r.status === 'cleanup'
    );
    return list.filter(r => r.status === f);
  });

  reservationsByTable = computed(() => {
    const map = new Map<number, FloorReservation[]>();
    for (const r of this.allReservationsForDay()) {
      if (r.status !== 'upcoming' && r.status !== 'confirmed' && r.status !== 'late' &&
          r.status !== 'seated'   && r.status !== 'expired'  && r.status !== 'cleanup') continue;
      // Alle Tische dieser Reservierung eintragen (einzeln + kombiniert)
      const ids = r.tableIds?.length ? r.tableIds : (r.tableId ? [r.tableId] : []);
      for (const id of ids) {
        const existing = map.get(id) ?? [];
        existing.push(r);
        map.set(id, existing);
      }
    }
    return map;
  });

  /** Reservierungen für das Dialog-Datum (formDate) — unabhängig vom Haupt-Kalender. */
  private readonly allReservationsForFormDay = computed(() => {
    const room = this.room();
    if (!room) return [];
    this.reservationsService.reservations(); // Reaktivität sicherstellen
    return this.reservationsService.forRoomAndDate(room.id, this.formDate());
  });

  private readonly reservationsByTableForForm = computed(() => {
    const map = new Map<number, FloorReservation[]>();
    for (const r of this.allReservationsForFormDay()) {
      if (r.status !== 'upcoming' && r.status !== 'confirmed' && r.status !== 'late' &&
          r.status !== 'seated'   && r.status !== 'expired'  && r.status !== 'cleanup') continue;
      const ids = r.tableIds?.length ? r.tableIds : (r.tableId ? [r.tableId] : []);
      for (const id of ids) {
        const existing = map.get(id) ?? [];
        existing.push(r);
        map.set(id, existing);
      }
    }
    return map;
  });

  stats = computed(() => {
    const list = this.allReservationsForDay();
    return {
      total:    list.length,
      upcoming:  list.filter(r => r.status === 'upcoming').length,
      confirmed: list.filter(r => r.status === 'confirmed').length,
      seated:    list.filter(r => r.status === 'seated').length,
      expired:   list.filter(r => r.status === 'expired').length,
      cleanup:   list.filter(r => r.status === 'cleanup').length,
      guests:    list
        .filter(r => r.status === 'upcoming' || r.status === 'confirmed' || r.status === 'late' || r.status === 'seated' || r.status === 'expired')
        .reduce((sum, r) => sum + r.partySize, 0),
    };
  });

  // ── Timeline-Drag (Verschieben + Verlängern der Blöcke) ──────────────────

  tlDrag: {
    resId:        string;
    type:         'move' | 'resize';
    startClientY: number;
    startValue:   number;  // Minuten ab Mitternacht (move) oder durationMinutes (resize)
    colHeightPx:  number;
    totalMinutes: number;
    moved:        boolean;
  } | null = null;

  private tlDragLastSnapped = -1;
  private suppressTlClick   = false;

  onTlResPointerDown(event: PointerEvent, res: FloorReservation, type: 'move' | 'resize'): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.isResHistoric(res)) return;

    const col = (event.target as HTMLElement).closest<HTMLElement>('.tl-col');
    if (!col) return;

    // Pointer-Capture: stellt sicher dass alle pointermove-Events ankommen,
    // auch wenn der Finger / die Maus das Element verlässt (wichtig für Trackpad)
    try { (event.target as HTMLElement).setPointerCapture(event.pointerId); } catch { /* ignore */ }

    const [h, m]  = res.time.split(':').map(Number);
    const startValue = type === 'move' ? (h * 60 + m) : res.durationMinutes;

    this.tlDrag = {
      resId:        res.id,
      type,
      startClientY: event.clientY,
      startValue,
      colHeightPx:  col.getBoundingClientRect().height,
      totalMinutes: (this.tlEndH - this.tlStartH) * 60,
      moved:        type === 'resize', // Resize startet sofort, Move braucht Schwelle
    };
    this.tlDragLastSnapped = startValue;
  }

  @HostListener('document:pointermove', ['$event'])
  onDocPointerMove(event: PointerEvent): void {
    const drag = this.tlDrag;
    if (!drag) return;
    // Verhindert Browser-Scroll / Trackpad-Scroll während Drag
    event.preventDefault();

    const deltaY = event.clientY - drag.startClientY;

    // Move: erst ab 4px-Schwelle als Drag erkennen
    if (drag.type === 'move' && !drag.moved) {
      if (Math.abs(deltaY) < 4) return;
      drag.moved = true;
    }

    const deltaMin = (deltaY / drag.colHeightPx) * drag.totalMinutes;
    const snapped  = Math.round(deltaMin / 15) * 15;
    let   newValue = drag.startValue + snapped;

    if (drag.type === 'resize') {
      newValue = Math.max(30, newValue);
    } else {
      newValue = Math.max(this.tlStartH * 60,
                 Math.min((this.tlEndH * 60) - 30, newValue));
    }

    if (newValue === this.tlDragLastSnapped) return;
    this.tlDragLastSnapped = newValue;

    if (drag.type === 'resize') {
      this.reservationsService.update(drag.resId, { durationMinutes: newValue });
    } else {
      const hh   = Math.floor(newValue / 60);
      const mm   = newValue % 60;
      const time = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
      this.reservationsService.update(drag.resId, { time });
    }
  }

  @HostListener('document:pointerup')
  onDocPointerUp(): void {
    const drag = this.tlDrag;
    if (!drag) return;
    if (drag.moved) this.suppressTlClick = true;
    this.tlDrag = null;
    if (!drag.moved) return;

    const res = this.reservationsService.reservations().find(r => r.id === drag.resId);
    if (!res?.backendId) return;

    const startsAt = `${res.date}T${res.time}:00`;
    this.apiReservations.update(res.backendId, {
      starts_at:        startsAt,
      duration_minutes: res.durationMinutes,
    }).subscribe({ error: () => console.warn('Timeline-Drag-Sync fehlgeschlagen') });
  }

  @HostListener('document:pointercancel')
  onDocPointerCancel(): void { this.tlDrag = null; }

  onTlResClick(res: FloorReservation): void {
    if (this.suppressTlClick) { this.suppressTlClick = false; return; }
    this.openGuestCard(res);
  }

  // ── Tagesverlauf (kleine Sparkline-Punkte pro Stunde) ─────────────────
  dayLoad = computed<Array<{ hour: number; count: number; isPeak: boolean; pct: number; loadLevel: 'empty' | 'green' | 'amber' | 'red' }>>(() => {
    const buckets = new Map<number, number>();
    for (const r of this.allReservationsForDay()) {
      if (r.status === 'cancelled' || r.status === 'no-show') continue;
      const h = parseInt(r.time.split(':')[0], 10);
      buckets.set(h, (buckets.get(h) ?? 0) + 1);
    }
    const totalTables = Math.max(1, this.room()?.tables.length ?? 1);
    const max = Math.max(1, ...buckets.values());
    const result: Array<{ hour: number; count: number; isPeak: boolean; pct: number; loadLevel: 'empty' | 'green' | 'amber' | 'red' }> = [];
    for (let h = 11; h <= 23; h++) {
      const count = buckets.get(h) ?? 0;
      const pct = Math.min(100, Math.round((count / totalTables) * 100));
      const loadLevel = count === 0 ? 'empty' : pct <= 40 ? 'green' : pct <= 70 ? 'amber' : 'red';
      result.push({ hour: h, count, isPeak: count === max && count > 0, pct, loadLevel });
    }
    return result;
  });

  // ── Sortiergewicht pro Status ─────────────────────────────────────────
  // Innerhalb einer Stunde: confirmed/upcoming zuerst, dann aktiv, dann done
  private statusSortWeight(status: FloorReservationStatus): number {
    switch (status) {
      case 'late':       return 0; // Verspätet ganz oben — braucht Aufmerksamkeit
      case 'confirmed':  return 1;
      case 'upcoming':   return 2;
      case 'expired':    return 3;
      case 'seated':     return 4;
      case 'cleanup':    return 5;
      case 'completed':  return 6;
      case 'cancelled':  return 7;
      case 'no-show':    return 8;
      default:           return 9;
    }
  }

  // ── Gruppierung nach Stunde für die Liste ─────────────────────────────
  // Strategie: alle Reservierungen zuerst global nach (statusWeight, Zeit) sortieren,
  // dann in Stunden-Gruppen zusammenfassen — so bleibt die Status-Reihenfolge erhalten
  // und es gibt keine Vermischung von Bevorstehend und Aktiv in der Gruppen-Sortierung.
  timeGroups = computed<Array<{ hour: string; reservations: FloorReservation[] }>>(() => {
    // 1. Alle RVs nach (Status-Gewicht, Uhrzeit) sortieren
    const sorted = [...this.filteredReservations()].sort((a, b) => {
      const sw = this.statusSortWeight(a.status) - this.statusSortWeight(b.status);
      if (sw !== 0) return sw;
      const byTime = a.time.localeCompare(b.time);
      return this.sortDir() === 'asc' ? byTime : -byTime;
    });

    // 2. In Stunden-Gruppen zusammenfassen — Reihenfolge der Gruppen folgt
    //    dem ersten Auftreten der Stunde in der sortierten Liste.
    const groupOrder: string[] = [];
    const groupMap = new Map<string, FloorReservation[]>();
    for (const r of sorted) {
      const hourKey = r.time.split(':')[0] + ':00';
      if (!groupMap.has(hourKey)) {
        groupOrder.push(hourKey);
        groupMap.set(hourKey, []);
      }
      groupMap.get(hourKey)!.push(r);
    }

    return groupOrder.map(hour => ({ hour, reservations: groupMap.get(hour)! }));
  });

  // ── Kebab-Menü ────────────────────────────────────────────────────────
  openMenuId = signal<string | null>(null);

  toggleMenu(event: MouseEvent, id: string) {
    event.stopPropagation();
    this.openMenuId.set(this.openMenuId() === id ? null : id);
  }

  closeMenu() { this.openMenuId.set(null); }

  // ── Datum-Helfer ──────────────────────────────────────────────────────
  private todayIso(): string {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  todayIsoPublic(): string { return this.todayIso(); }

  shiftDate(days: number) {
    const [y, m, d] = this.selectedDate().split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const closed = this.closedWeekdays();
    for (let i = 0; i < 14; i++) {
      dt.setDate(dt.getDate() + days);
      if (!closed.includes((dt.getDay() + 6) % 7)) break;
    }
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    this.selectedDate.set(`${dt.getFullYear()}-${mm}-${dd}`);
  }

  goToday() { this.selectedDate.set(this.todayIso()); }

  /**
   * Das MatDatepicker-Widget arbeitet mit nativen Date-Objekten.
   * Intern speichern wir das Datum als ISO-String (YYYY-MM-DD), damit
   * Reservierungen einfach nach Datum gruppiert werden können.
   * Diese beiden Helper überbrücken das.
   */
  selectedDateAsDate = computed<Date>(() => {
    const [y, m, d] = this.selectedDate().split('-').map(Number);
    return new Date(y, m - 1, d);
  });

  onDateSelected(event: MatDatepickerInputEvent<Date>): void {
    const d = event.value;
    if (!d) return;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    this.selectedDate.set(`${d.getFullYear()}-${mm}-${dd}`);
  }

  formatDateLabel(): string {
    const iso = this.selectedDate();
    const today = this.todayIso();
    if (iso === today) return 'Heute';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dt.toDateString() === tomorrow.toDateString()) return 'Morgen';
    return dt.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // ── Neuer-Reservierung-Dialog ─────────────────────────────────────────
  private splitName(full: string): { vorname: string; nachname: string } {
    const parts = full.trim().split(/\s+/);
    return { vorname: parts[0] ?? '', nachname: parts.slice(1).join(' ') };
  }

  onVornameInput(val: string): void {
    this.form.guestName = val;
    this.onGuestNameInput(val);
  }

  hideSuggestionsDelayed(): void {
    setTimeout(() => {
      this.guestSuggestions.set([]);
      this.showSuggestions.set(false);
    }, 150);
  }

  /** Scrollt die selektierte Uhrzeit-Karte in den sichtbaren Bereich. */
  scrollSelectedPickerCard(): void {
    const rows = document.querySelectorAll<HTMLElement>('.picker-row');
    rows.forEach(row => {
      const selected = row.querySelector<HTMLElement>('.table-inline__card--selected');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest', inline: 'center' });
      }
    });
  }

  openNewDialog(preset?: Partial<typeof this.form>) {
    const [cy, cm] = this.selectedDate().split('-').map(Number);
    this.formDate.set(this.selectedDate());
    this.calendarYear.set(cy);
    this.calendarMonth.set(cm - 1);
    this.form = {
      guestName: '',
      vorname:   '',
      nachname:  '',
      guestEmail: '',
      partySize: 2,
      time: this.filteredTimeSlots()[0] ?? this.nextSlot(),
      durationMinutes: this.timing.defaultDurationMinutes(),
      tableId: 0,
      tableIds: [] as number[],
      phone: '',
      notes: '',
      isWalkIn: false,
      ...preset,
    };
    // tableIds aus tableId ableiten falls nicht explizit gesetzt
    if (!this.form.tableIds?.length && this.form.tableId) {
      this.form.tableIds = [this.form.tableId];
    }
    // Falls preset einen kombinierten guestName mitbringt → in vorname übernehmen
    if (this.form.guestName && !this.form.vorname) {
      this.form.vorname = this.form.guestName;
    }
    this.formDurationMinutes.set(this.form.durationMinutes);
    this.formError.set(null);
    this.formSubmitAttempted.set(false);
    this.editingId.set(null);
    this.mobileStep.set(1);
    this.newDialogOpen.set(true);
    setTimeout(() => {
      (document.querySelector('.reservation-form__name-input') as HTMLInputElement | null)?.focus();
      this.scrollSelectedPickerCard();
    }, 0);
  }

  /**
   * Walk-In-Dialog: Variante des Neue-Reservierung-Dialogs für Gäste, die
   * spontan ohne Reservierung kommen. Vorbelegung:
   *   • Uhrzeit = aktuelle Uhrzeit (nicht das nächste 30-Min-Slot)
   *   • isWalkIn = true → beim Speichern wird Status sofort "seated" gesetzt
   * Tisch und Gästezahl werden vom Mitarbeiter im Dialog gewählt.
   */
  openWalkInDialog() {
    this.openNewDialog({
      time: this.currentTime(),
      isWalkIn: true,
    });
  }

  /** Aktuelle Uhrzeit als "HH:MM" — für Walk-Ins, die jetzt sofort sitzen. */
  private currentTime(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // ── Tisch-Umplatzierung per Long-Press ────────────────────────────────
  reassignMode   = signal<{ reservationId: string; sourceTableId: number } | null>(null);
  /** Ziel-Tisch gewählt — warten auf Wahl zwischen Umplatzieren und Splitten */
  reassignChoice = signal<{ targetTableId: number } | null>(null);
  private longPressTimer: any = null;
  private suppressNextClick = false;

  /** Pointer runter: ggf. Long-Press-Timer starten (nur wenn Tisch eine Reservierung hat). */
  onTablePointerDown(tableId: number, event: PointerEvent): void {
    // Nur primäre Taste (Maus links, Touch)
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    // Während Reassign-Modus nicht neu starten
    if (this.reassignMode()) return;

    const status = this.tableStatus(tableId);
    if (!status.reservation) return;

    const reservationId = status.reservation.id;
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      this.suppressNextClick = true;
      try { (navigator as any).vibrate?.(30); } catch { /* ignore */ }
      this.reassignMode.set({ reservationId, sourceTableId: tableId });
    }, 500);
  }

  /** Pointer hoch / verlässt Tisch: Long-Press abbrechen, falls noch nicht gefeuert. */
  onTablePointerEnd(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /**
   * Klick auf einen Gäste-Chip am Tisch.
   * Im Reassign-Modus → Tisch als Umplatzierungs-Ziel wählen (Chip darf Event nicht schlucken).
   * Sonst → Gastkarte öffnen und Bubbling stoppen.
   */
  onGuestChipClick(tableId: number, res: FloorReservation, event: MouseEvent): void {
    event.stopPropagation();
    if (this.reassignMode()) {
      this.onTableClick(tableId, event);
      return;
    }
    this.openGuestCard(res);
  }

  /**
   * Normaler Klick auf einen Tisch:
   *  – im Umplatzier-Modus: Ziel festlegen (oder bei Quelltisch abbrechen)
   *  – Tisch frei  → neue Reservierung mit vorausgewähltem Tisch
   *  – Tisch belegt → bestehende Reservierung bearbeiten
   */
  onTableClick(tableId: number, event: MouseEvent): void {
    event.stopPropagation();

    // Nach Long-Press den darauf folgenden Klick schlucken
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }

    const mode = this.reassignMode();
    if (mode) {
      if (tableId === mode.sourceTableId) {
        this.reassignMode.set(null);
        this.reassignChoice.set(null);
        return;
      }
      // Ziel gewählt → Auswahlmenü anzeigen statt sofort handeln
      this.reassignChoice.set({ targetTableId: tableId });
      return;
    }

    // Tischklick öffnet immer eine neue Reservierung (Tisch vorausgewählt).
    // Bestehende Gäste lassen sich per Klick auf den Gäste-Chip bearbeiten.
    const t = this.room()?.tables.find(x => x.id === tableId);
    const seats = t?.seats ?? 2;
    this.openNewDialog({ tableId, partySize: Math.min(seats, 4) });
  }

  // Timeline-Slot-Klick: Tisch + Uhrzeit vorausgewählt
  openFromSlot(tableId: number, time: string): void {
    const t = this.room()?.tables.find(x => x.id === tableId);
    const seats = t?.seats ?? 2;
    this.openNewDialog({ tableId, time, partySize: Math.min(seats, 4) });
  }

  cancelReassign(): void {
    this.reassignMode.set(null);
    this.reassignChoice.set(null);
  }

  /** Reservierung auf den Ziel-Tisch umplatzieren (alten Tisch aufgeben). */
  doReassign(): void {
    const mode   = this.reassignMode();
    const choice = this.reassignChoice();
    if (!mode || !choice) return;
    const tid = choice.targetTableId;
    this.reservationsService.update(mode.reservationId, { tableId: tid, tableIds: [tid] });
    this.syncTableToBackend(mode.reservationId, tid);
    this.reassignChoice.set(null);
    this.reassignMode.set(null);
  }

  /** Reservierung auf beide Tische aufteilen (Quell- + Zieltisch). */
  doSplit(): void {
    const mode   = this.reassignMode();
    const choice = this.reassignChoice();
    if (!mode || !choice) return;
    const res = this.reservationsService.reservations().find(r => r.id === mode.reservationId);
    const currentIds = res?.tableIds?.length ? res.tableIds : (res?.tableId ? [res.tableId] : []);
    const newIds = [...new Set([...currentIds, choice.targetTableId])];
    this.reservationsService.update(mode.reservationId, {
      tableIds: newIds,
      tableId:  currentIds[0] ?? choice.targetTableId,
    });
    this.syncTableToBackend(mode.reservationId, currentIds[0] ?? choice.targetTableId);
    this.reassignChoice.set(null);
    this.reassignMode.set(null);
  }

  /**
   * Quelltisch aus dem Split entfernen — die restlichen Tische bleiben erhalten.
   * Beispiel: Split [2, 3, 4], Quelltisch 3 auf Tisch 4 ziehen → bleibt [2, 4].
   */
  doMerge(): void {
    const mode   = this.reassignMode();
    const choice = this.reassignChoice();
    if (!mode || !choice) return;
    const res = this.reservationsService.reservations().find(r => r.id === mode.reservationId);
    const currentIds = res?.tableIds?.length ? res.tableIds : (res?.tableId ? [res.tableId] : []);
    const newIds = currentIds.filter(id => id !== mode.sourceTableId);
    const primaryId = newIds[0] ?? choice.targetTableId;
    this.reservationsService.update(mode.reservationId, {
      tableId:  primaryId,
      tableIds: newIds,
    });
    this.syncTableToBackend(mode.reservationId, primaryId);
    this.reassignChoice.set(null);
    this.reassignMode.set(null);
  }

  /**
   * True wenn der Zieltisch bereits Teil des Splits ist.
   * Nur dann soll "Zusammenführen" erscheinen — zieht man auf einen neuen Tisch,
   * bleibt es "Splitten" (auch wenn die RV schon mehrere Tische hat).
   */
  get reassignResSplit(): boolean {
    const mode   = this.reassignMode();
    const choice = this.reassignChoice();
    if (!mode || !choice) return false;
    const res = this.reservationsService.reservations().find(r => r.id === mode.reservationId);
    const ids = res?.tableIds?.length ? res.tableIds : (res?.tableId ? [res.tableId] : []);
    return ids.length > 1 && ids.includes(choice.targetTableId);
  }

  /** Schreibt die Tisch-Zuweisung einer lokalen Reservierung ins Backend (fire-and-forget). */
  private syncTableToBackend(localId: string, tableId: number | null): void {
    const backendId = this.reservationsService.reservations().find(r => r.id === localId)?.backendId;
    if (!backendId) return;
    this.apiReservations.update(backendId, { table_id: tableId }).subscribe({
      error: () => console.warn('Tisch-Sync fehlgeschlagen für', backendId),
    });
  }

  /** Klick in den leeren Plan oder Escape → Umplatzierung abbrechen. */
  onCanvasClick(): void {
    if (this.reassignMode()) this.cancelReassign();
    if (this.splitPickerFor() !== null) this.splitPickerFor.set(null);
  }

  // ── Tisch teilen (mehrere Reservierungen am gleichen Tisch) ──────────────
  splitPickerFor     = signal<number | null>(null);
  /** Tisch-ID für den "Tische trennen"-Bestätigungsdialog im Tischplan */
  splitRoomTableId   = signal<number | null>(null);

  openRoomSplitDialog(tableId: number, event: Event): void {
    event.stopPropagation();
    this.splitRoomTableId.set(tableId);
  }

  confirmRoomSplit(): void {
    const id    = this.splitRoomTableId();
    const room  = this.room();
    if (id === null || !room) return;
    const table = room.tables.find(t => t.id === id);
    if (!table) return;

    const newTables = room.tables.map(t => {
      if (t.id === id || t.id === table.mergedWith)
        return { ...t, mergedWith: undefined as number | undefined,
                       seats: (t as any).originalSeats ?? t.seats,
                       originalSeats: undefined };
      return t;
    });

    this.roomsService.updateRoom(room.id, { tables: newTables }).subscribe({
      error: () => console.warn('Trennen konnte nicht gespeichert werden'),
    });
    this.splitRoomTableId.set(null);
  }

  cancelRoomSplit(): void { this.splitRoomTableId.set(null); }

  readonly unassignedForDay = computed(() =>
    this.allReservationsForDay().filter(r =>
      !r.tableId &&
      r.status !== 'cancelled' &&
      r.status !== 'no-show'
    )
  );

  tableAllActiveReservations(tableId: number): FloorReservation[] {
    return this.reservationsByTable().get(tableId) ?? [];
  }

  // ── Gäste-Chips: Aufklapp-Zustand pro Tisch ───────────────────────────
  private expandedGuestTables = signal<Set<number>>(new Set());

  isGuestsExpanded(tableId: number): boolean {
    return this.expandedGuestTables().has(tableId);
  }

  toggleGuestsExpanded(tableId: number, event: MouseEvent): void {
    event.stopPropagation();
    this.expandedGuestTables.update(set => {
      const next = new Set(set);
      next.has(tableId) ? next.delete(tableId) : next.add(tableId);
      return next;
    });
  }

  /** Sichtbare Reservierungen: max. 2 — außer der Tisch ist aufgeklappt. */
  visibleGuestReservations(tableId: number): FloorReservation[] {
    const all = this.tableAllActiveReservations(tableId);
    return this.isGuestsExpanded(tableId) ? all : all.slice(0, 2);
  }

  openSplitPicker(tableId: number, event: MouseEvent): void {
    event.stopPropagation();
    this.splitPickerFor.set(this.splitPickerFor() === tableId ? null : tableId);
  }

  addToSplitTable(reservationId: string): void {
    const tableId = this.splitPickerFor();
    if (!tableId) return;
    this.reservationsService.update(reservationId, { tableId });
    this.syncTableToBackend(reservationId, tableId);
    this.splitPickerFor.set(null);
  }

  removeFromTable(reservationId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.reservationsService.update(reservationId, { tableId: undefined, tableIds: [] });
    this.syncTableToBackend(reservationId, null);
  }

  @HostListener('document:keyup.escape')
  onEscape(): void {
    if (this.reassignChoice()) { this.reassignChoice.set(null); return; }
    if (this.reassignMode()) this.cancelReassign();
  }

  openEditDialog(res: FloorReservation) {
    const ids = res.tableIds?.length ? res.tableIds : (res.tableId ? [res.tableId] : []);
    this.form = {
      guestName: res.guestName,
      vorname:   res.guestName,
      nachname:  '',
      guestEmail: res.guestEmail ?? '',
      partySize: res.partySize,
      time: res.time,
      durationMinutes: res.durationMinutes,
      tableId: res.tableId ?? 0,
      tableIds: ids,
      phone: res.phone ?? '',
      notes: res.notes ?? '',
      isWalkIn: false,
    };
    this.formDurationMinutes.set(res.durationMinutes);
    this.formError.set(null);
    this.formSubmitAttempted.set(false);
    this.editingId.set(res.id);
    this.editingReservation.set(res);
    this.editDialogOpen.set(true);
  }

  closeFormDialog() {
    this.newDialogOpen.set(false);
    this.editDialogOpen.set(false);
    this.editingId.set(null);
    this.editingReservation.set(null);
    this.formError.set(null);
    this.formSubmitAttempted.set(false);
    this.guestSuggestions.set([]);
    this.showSuggestions.set(false);
    this.mobileStep.set(1);
  }

  nextMobileStep(): void {
    if (this.mobileStep() < this.mobileStepMax) this.mobileStep.update(s => s + 1);
  }

  prevMobileStep(): void {
    if (this.mobileStep() > 1) this.mobileStep.update(s => s - 1);
  }

  onGuestNameInput(value: string): void {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    if (value.trim().length < 2) {
      this.guestSuggestions.set([]);
      this.showSuggestions.set(false);
      return;
    }
    this.searchTimeout = setTimeout(() => {
      this.guestsService.load({ search: value.trim(), limit: 6 }).subscribe(res => {
        this.guestSuggestions.set(res.guests);
        this.showSuggestions.set(res.guests.length > 0);
      });
    }, 200);
  }

  selectGuest(guest: Guest): void {
    this.form.guestName  = guest.name;
    this.form.vorname    = guest.name;
    this.form.nachname   = '';
    this.form.guestEmail = guest.email;
    this.form.phone      = guest.phone ?? '';
    this.guestSuggestions.set([]);
    this.showSuggestions.set(false);
  }

  guestInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  resolveGasttypen(keys: string[] = []): ConfigItem[] {
    return this.availableGasttypen().filter(g => keys.includes(g.key));
  }

  resolveHinweise(keys: string[] = []): ConfigItem[] {
    return this.availableHinweise().filter(h => keys.includes(h.key));
  }

  private nextSlot(): string {
    const d = new Date();
    let h = d.getHours();
    let m = d.getMinutes() < 30 ? 30 : 0;
    if (m === 0) h += 1;
    if (h >= 24) { h = 19; m = 0; }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  saveForm() {
    const room = this.room();
    if (!room) return;

    this.formSubmitAttempted.set(true);

    // Namensfeld direkt übernehmen
    this.form.guestName = this.form.vorname.trim();
    const name = this.form.guestName.trim();
    if (!name) { this.formError.set('Bitte gib einen Namen ein.'); return; }
    if (this.form.partySize < 1) { this.formError.set('Personenanzahl muss mindestens 1 sein.'); return; }
    if (!/^\d{2}:\d{2}$/.test(this.form.time)) { this.formError.set('Bitte eine gültige Uhrzeit eingeben.'); return; }
    const editId  = this.editingId();
    const editing = this.editingReservation();
    // tableIds → tableId (erster Eintrag) synchronisieren
    const primaryTableId = this.form.tableIds[0] ?? 0;
    this.form.tableId  = primaryTableId;

    if (editId && editing) {
      // Status upgraden: wenn jetzt ein Tisch zugewiesen ist und der Gast
      // noch nicht eingecheckt ist, auf "confirmed" (Bevorstehend) wechseln.
      const hasTable = !!(primaryTableId || this.form.tableIds.length);
      const currentStatus = editing.status;
      const newStatus: FloorReservationStatus | undefined =
        hasTable && (currentStatus === 'upcoming')  ? 'confirmed' :
        !hasTable && currentStatus === 'confirmed'  ? 'upcoming'  : undefined;

      // Lokalen Floor-State aktualisieren
      this.reservationsService.update(editId, {
        guestName:       name,
        partySize:       this.form.partySize,
        time:            this.form.time,
        durationMinutes: this.form.durationMinutes,
        tableId:         primaryTableId || undefined,
        tableIds:        this.form.tableIds.length ? this.form.tableIds : undefined,
        phone:           this.form.phone.trim() || undefined,
        notes:           this.form.notes.trim() || undefined,
        ...(newStatus ? { status: newStatus } : {}),
      });

      // Backend synchronisieren, falls eine Backend-ID verknüpft ist
      if (editing.backendId) {
        const startsAt = `${editing.date}T${this.form.time}:00`;
        this.apiReservations.update(editing.backendId, {
          guest_name:       name,
          party_size:       this.form.partySize,
          starts_at:        startsAt,
          duration_minutes: this.form.durationMinutes,
          guest_phone:      this.form.phone.trim() || undefined,
          notes:            this.form.notes.trim() || undefined,
        }).subscribe({
          error: () => console.warn('Backend-Update fehlgeschlagen, lokale Änderung bleibt.'),
        });
      }

      this.closeFormDialog();
    } else {
      // Vor dem Anlegen prüfen ob der Slot noch frei ist (frische Backend-Daten).
      const formDateVal  = this.formDate();
      const totalTables  = room.tables?.length ?? 0;
      const slotStartMs  = new Date(`${formDateVal}T${this.form.time}:00`).getTime();
      const slotEndMs    = slotStartMs + this.form.durationMinutes * 60_000;

      const doCreate = () => this.doCreateReservation(room, name, primaryTableId, formDateVal);

      // Synchrone Lokalprüfungen — greifen immer, unabhängig vom Netzwerk.

      // 1) Raum-weiter Concurrent-Check über alle lokalen Reservierungen des Datums
      const localActive = this.reservationsService
        .forRoomAndDate(room.id, formDateVal)
        .filter(r => !['cancelled', 'completed'].includes(r.status));
      const localConcurrent = localActive.filter(r => {
        const dur = r.durationMinutes > 0 ? r.durationMinutes : this.form.durationMinutes;
        const s   = new Date(`${formDateVal}T${r.time}:00`).getTime();
        const e   = s + dur * 60_000;
        return s < slotEndMs && e > slotStartMs;
      }).length;
      if (totalTables > 0 && localConcurrent >= totalTables) {
        this.formError.set('Diese Uhrzeit ist nicht verfügbar — alle Tische sind zu dieser Zeit belegt.');
        return;
      }

      // 2) Konkret gewählter Tisch bereits belegt?
      if (primaryTableId && this.isTableOccupied(primaryTableId, this.form.time, this.form.durationMinutes)) {
        this.formError.set('Dieser Tisch ist zu dieser Uhrzeit bereits belegt.');
        return;
      }

      if (totalTables === 0) {
        doCreate();
        return;
      }

      this.apiReservations.loadForVenue(room.id, formDateVal).pipe(take(1)).subscribe({
        next: (freshRes) => {
          const active = freshRes.filter(r => !['cancelled', 'completed'].includes(r.status));

          // Raum komplett voll?
          const concurrent = active.filter(r => {
            const s = new Date(r.starts_at).getTime();
            const e = new Date(r.ends_at).getTime();
            return s < slotEndMs && e > slotStartMs;
          }).length;
          if (concurrent >= totalTables) {
            this.formError.set('Diese Uhrzeit ist nicht verfügbar — alle Tische sind zu dieser Zeit belegt.');
            return;
          }

          // Konkret gewählter Tisch bereits belegt?
          if (primaryTableId) {
            const tableOccupied = active.some(r => {
              if (r.table_number !== primaryTableId) return false;
              const s = new Date(r.starts_at).getTime();
              const e = new Date(r.ends_at).getTime();
              return s < slotEndMs && e > slotStartMs;
            });
            if (tableOccupied) {
              this.formError.set('Dieser Tisch ist zu dieser Uhrzeit bereits belegt.');
              return;
            }
          }

          doCreate();
        },
        error: () => doCreate(), // bei Netzwerkfehler trotzdem anlegen
      });
    }
  }

  private doCreateReservation(room: SavedRoom, name: string, primaryTableId: number, formDateVal: string) {
    const isWalkIn = this.form.isWalkIn;
    const local = this.reservationsService.add({
      roomId:          room.id,
      guestName:       name,
      partySize:       this.form.partySize,
      date:            formDateVal,
      time:            this.form.time,
      durationMinutes: this.form.durationMinutes,
      tableId:         primaryTableId || undefined,
      tableIds:        this.form.tableIds.length ? this.form.tableIds : undefined,
      phone:           this.form.phone.trim() || undefined,
      notes:           this.form.notes.trim() || undefined,
      status:          isWalkIn ? 'seated'
                         : (primaryTableId || this.form.tableIds.length) ? 'confirmed'
                         : 'upcoming',
    });

    const startsAt = `${formDateVal}T${this.form.time}:00`;
    this.apiReservations.create({
      venue_id:         room.id,
      guest_name:       name,
      guest_email:      this.form.guestEmail.trim() || undefined,
      guest_phone:      this.form.phone.trim() || undefined,
      party_size:       this.form.partySize,
      starts_at:        startsAt,
      notes:            this.form.notes.trim() || undefined,
      duration_minutes: this.form.durationMinutes,
      table_id:         primaryTableId || undefined,
    }).subscribe({
      next: res => {
        // backendId setzen, dann initialen Status ans Backend senden
        this.reservationsService.update(local.id, { backendId: res.id });
        this.reservationsService.setStatus(local.id, local.status);
      },
      error: () => console.warn('Reservierung lokal gespeichert, Backend-Sync fehlgeschlagen.'),
    });

    this.closeFormDialog();
  }

  // ── Status-Aktionen ───────────────────────────────────────────────────
  checkIn(res: FloorReservation) {
    if (!res.tableId) {
      this.tablePickerFor.set(res.id);
      return;
    }
    this.reservationsService.setStatus(res.id, 'seated');
    this.getraenke.startTimer(res.id);
  }

  assignTableAndCheckIn(tableId: number) {
    const id = this.tablePickerFor();
    if (!id) return;
    this.reservationsService.update(id, { tableId });
    this.syncTableToBackend(id, tableId);
    this.reservationsService.setStatus(id, 'seated');
    this.getraenke.startTimer(id);
    this.tablePickerFor.set(null);
  }

  skipTableAndCheckIn() {
    const id = this.tablePickerFor();
    if (!id) return;
    this.reservationsService.setStatus(id, 'seated');
    this.getraenke.startTimer(id);
    this.tablePickerFor.set(null);
  }

  acknowledgeGetraenke(reservationId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.getraenke.acknowledgeAlert(reservationId);
  }

  closeTablePicker() { this.tablePickerFor.set(null); }

  /**
   * Reservierung beenden:
   *   • Cleanup AN  → Status → 'cleanup' (Tisch bleibt visuell belegt,
   *     Heartbeat schaltet ihn nach Ablauf der Cleanup-Zeit auf 'completed').
   *   • Cleanup AUS → Status sofort auf 'completed'.
   */
  markCompleted(res: FloorReservation) {
    this.getraenke.cancelTimer(res.id);
    this.reservationsService.setStatus(
      res.id,
      this.timing.cleanupEnabled() ? 'cleanup' : 'completed',
    );
  }

  /** Cleanup abbrechen / Tisch sofort als frei markieren. */
  markCleanupDone(res: FloorReservation) {
    this.reservationsService.setStatus(res.id, 'completed');
  }

  markNoShow(res: FloorReservation) {
    this.getraenke.cancelTimer(res.id);
    this.reservationsService.setStatus(res.id, 'no-show');
  }

  cancel(res: FloorReservation) {
    this.getraenke.cancelTimer(res.id);
    this.reservationsService.setStatus(res.id, 'cancelled');
  }

  remove(res: FloorReservation) {
    this.getraenke.cancelTimer(res.id);
    this.reservationsService.remove(res.id);
  }

  reopen(res: FloorReservation) {
    const hasTable = !!(res.tableId || res.tableIds?.length);
    this.reservationsService.setStatus(res.id, hasTable ? 'confirmed' : 'upcoming');
  }

  /**
   * Verlängert eine "Zeit abgelaufen"-Reservierung um 30 Minuten und
   * setzt sie zurück auf "seated". Der Auto-Expire-Heartbeat wird sie
   * dann nach Ablauf der zusätzlichen 30 Minuten erneut auf "expired"
   * setzen.
   */
  extendReservation(res: FloorReservation, addMinutes: number = 30) {
    const newDuration = (res.durationMinutes ?? 0) + addMinutes;

    // 1. Lokal: neue Dauer setzen + zurück auf "seated" (inkl. Backend-Sync /seat)
    this.reservationsService.update(res.id, { durationMinutes: newDuration });
    this.reservationsService.setStatus(res.id, 'seated');

    // 2. Backend: neue Dauer persistieren (ends_at neu berechnen)
    if (res.backendId) {
      this.apiReservations.update(res.backendId, { duration_minutes: newDuration }).subscribe({
        error: () => console.warn('Verlängerung konnte nicht synchronisiert werden'),
      });
    }
  }

  // ── Rendering-Helfer (aus restaurant-plan übernommen) ─────────────────

  getTableSize(type: TableType): { w: number; h: number } {
    return type === 'long' ? { w: 140, h: 70 } : { w: 70, h: 70 };
  }

  getDecorSize(type: DecorType): { w: number; h: number } {
    if (type === 'bar' || type === 'stage' || type === 'sofa') return { w: 140, h: 70 };
    if (type === 'window') return { w: 140, h: 32 };
    return { w: 70, h: 70 };
  }

  getTableCenter(t: PlacedTable): { x: number; y: number } {
    const { w, h } = this.getTableSize(t.type);
    return { x: t.x + (w * t.scale) / 2, y: t.y + (h * t.scale) / 2 };
  }

  getSeatPositions(count: number): Array<{ x: number; y: number }> {
    return Array.from({ length: count }, (_, i) => {
      const a = (2 * Math.PI * i / count) - Math.PI / 2;
      return { x: +(35 + 31 * Math.cos(a)).toFixed(1), y: +(35 + 31 * Math.sin(a)).toFixed(1) };
    });
  }

  getLongTableSeatPositions(count: number): Array<{ x: number; y: number }> {
    const tableLeft = 8, tableRight = 132;
    const w = tableRight - tableLeft;
    const topCount    = Math.ceil(count / 2);
    const bottomCount = Math.floor(count / 2);
    const positions: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < topCount; i++)
      positions.push({ x: +(tableLeft + w / (topCount + 1) * (i + 1)).toFixed(1), y: 5 });
    for (let i = 0; i < bottomCount; i++)
      positions.push({ x: +(tableLeft + w / (bottomCount + 1) * (i + 1)).toFixed(1), y: 65 });
    return positions;
  }

  // ── Tisch-Zusammenführung im Formular ────────────────────────────────

  /** Gesamtsitzplätze der aktuell ausgewählten Tische. */
  selectedSeatsTotal(): number {
    const tables = this.room()?.tables ?? [];
    return this.form.tableIds.reduce((sum, id) => {
      const t = tables.find(x => x.id === id);
      return sum + (t?.seats ?? 0);
    }, 0);
  }

  /** Wechselt einen Tisch in/aus der Mehrfachauswahl. */
  toggleTableSelection(id: number): void {
    if (id === 0) { this.form.tableIds = []; return; }
    const idx = this.form.tableIds.indexOf(id);
    if (idx >= 0) {
      this.form.tableIds = this.form.tableIds.filter(x => x !== id);
    } else {
      this.form.tableIds = [...this.form.tableIds, id];
    }
    this.form.tableId = this.form.tableIds[0] ?? 0;
  }

  /** Gibt zurück ob der Tisch-ID aktuell ausgewählt ist. */
  isTableSelected(id: number): boolean {
    return id === 0 ? this.form.tableIds.length === 0 : this.form.tableIds.includes(id);
  }

  /** Sitzplätze des vorgeschlagenen Zusatztisches (für Template-Anzeige). */
  suggestedTableSeats(sugId: number): number {
    return this.room()?.tables.find(t => t.id === sugId)?.seats ?? 0;
  }

  /** Liefert Paare benachbarter Tische für die Zusammenführungs-Linien im Plan. */
  getReservationMergePairs(): Array<{ a: PlacedTable; b: PlacedTable }> {
    const r = this.room();
    if (!r) return [];
    const pairs: Array<{ a: PlacedTable; b: PlacedTable }> = [];
    // Aus tableIds-Gruppen aller aktiven Reservierungen Paare bilden
    const allRes = this.allReservationsForDay();
    for (const res of allRes) {
      const ids = res.tableIds?.length ? res.tableIds : (res.tableId ? [res.tableId] : []);
      if (ids.length < 2) continue;
      for (let i = 0; i < ids.length - 1; i++) {
        const a = r.tables.find(t => t.id === ids[i]);
        const b = r.tables.find(t => t.id === ids[i + 1]);
        if (a && b) pairs.push({ a, b });
      }
    }
    return pairs;
  }

  /** Gibt zurück ob zwei Tische im Grundriss nahe beieinander stehen (< 200 px). */
  areTablesAdjacent(a: PlacedTable, b: PlacedTable): boolean {
    const ca = this.getTableCenter(a);
    const cb = this.getTableCenter(b);
    return Math.hypot(cb.x - ca.x, cb.y - ca.y) < 200;
  }

  /**
   * Wenn genau ein Tisch ausgewählt ist und die Personenzahl nicht reicht,
   * liefert dies den nächstgelegenen freien Tisch als beste Ergänzung.
   * Normale Methode (kein computed) weil form.tableIds kein Signal ist.
   */
  bestMergeSuggestion(): number | null {
    if (this.form.tableIds.length !== 1) return null;
    const r = this.room();
    if (!r) return null;
    const selectedId = this.form.tableIds[0];
    const selectedTable = r.tables.find(t => t.id === selectedId);
    if (!selectedTable) return null;
    if (selectedTable.seats >= this.form.partySize) return null;
    const need = this.form.partySize - selectedTable.seats;
    const ca   = this.getTableCenter(selectedTable);
    const candidates = this.availableTables()
      .filter(t => t.id !== selectedId &&
        !this.isTableOccupied(t.id, this.form.time, this.form.durationMinutes, this.editingId()))
      .map(t => ({ t, dist: Math.hypot(this.getTableCenter(t).x - ca.x, this.getTableCenter(t).y - ca.y) }))
      .sort((a, b) => a.dist - b.dist);
    const best = candidates.find(c => c.t.seats >= need);
    return best ? best.t.id : (candidates[0]?.t.id ?? null);
  }

  /** Schlägt Tisch-Paare/-Gruppen vor die zusammen genug Plätze haben. */
  mergeSuggestions(): Array<{ ids: number[]; seats: number }> {
    const r = this.room();
    if (!r) return [];
    const need   = this.form.partySize;
    const tables = this.availableTables();
    const results: Array<{ ids: number[]; seats: number }> = [];
    for (const t of tables) {
      if (t.seats >= need) return []; // Einzeltisch reicht
    }
    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        const a = tables[i], b = tables[j];
        if (!this.areTablesAdjacent(a, b)) continue;
        const seats = a.seats + b.seats;
        if (seats >= need) results.push({ ids: [a.id, b.id], seats });
      }
    }
    if (!results.length) {
      for (let i = 0; i < tables.length; i++) {
        for (let j = i + 1; j < tables.length; j++) {
          for (let k = j + 1; k < tables.length; k++) {
            const seats = tables[i].seats + tables[j].seats + tables[k].seats;
            if (seats >= need) results.push({ ids: [tables[i].id, tables[j].id, tables[k].id], seats });
          }
        }
      }
    }
    return results.slice(0, 3);
  }

  getMergedPairs(): Array<{ a: PlacedTable; b: PlacedTable }> {
    const r = this.room();
    if (!r) return [];
    const pairs: Array<{ a: PlacedTable; b: PlacedTable }> = [];
    const seen = new Set<number>();
    for (const t of r.tables) {
      if (t.mergedWith !== undefined && !seen.has(t.id)) {
        const other = r.tables.find(o => o.id === t.mergedWith);
        if (other) { pairs.push({ a: t, b: other }); seen.add(t.id); seen.add(other.id); }
      }
    }
    return pairs;
  }

  getMidpointStyle(a: PlacedTable, b: PlacedTable): Record<string, string> {
    const ca = this.getTableCenter(a);
    const cb = this.getTableCenter(b);
    return {
      left: ((ca.x + cb.x) / 2) + 'px',
      top:  ((ca.y + cb.y) / 2) + 'px',
    };
  }

  getMergeLineStyle(a: PlacedTable, b: PlacedTable): Record<string, string> {
    const ca  = this.getTableCenter(a);
    const cb  = this.getTableCenter(b);
    const len = Math.hypot(cb.x - ca.x, cb.y - ca.y);
    const ang = Math.atan2(cb.y - ca.y, cb.x - ca.x) * 180 / Math.PI;
    return {
      left:            ca.x + 'px',
      top:             ca.y + 'px',
      width:           len + 'px',
      transform:       `rotate(${ang}deg)`,
      transformOrigin: '0 50%',
    };
  }

  totalSeats(): number {
    return (this.room()?.tables ?? []).reduce((sum, t) => sum + t.seats, 0);
  }

  // ── Tisch-Status fürs Overlay ─────────────────────────────────────────
  tableStatus(tableId: number): { status: FloorReservationStatus | null; reservation: FloorReservation | null } {
    const list = this.reservationsByTable().get(tableId) ?? [];
    // Priorität: expired > late > seated > cleanup > confirmed > upcoming.
    const expired   = list.find(r => r.status === 'expired');
    if (expired)   return { status: 'expired',   reservation: expired   };
    const late      = list.find(r => r.status === 'late');
    if (late)      return { status: 'late',      reservation: late      };
    const seated    = list.find(r => r.status === 'seated');
    if (seated)    return { status: 'seated',    reservation: seated    };
    const cleanup   = list.find(r => r.status === 'cleanup');
    if (cleanup)   return { status: 'cleanup',   reservation: cleanup   };
    const confirmed = list.find(r => r.status === 'confirmed');
    if (confirmed) return { status: 'confirmed', reservation: confirmed };
    const upcoming  = list.find(r => r.status === 'upcoming');
    if (upcoming)  return { status: 'upcoming',  reservation: upcoming  };
    return { status: null, reservation: null };
  }

  tableStatusClass(tableId: number): string {
    const s = this.tableStatus(tableId).status;
    if (s === 'expired')   return 'is-expired';
    if (s === 'late')      return 'is-late';
    if (s === 'seated')    return 'is-seated';
    if (s === 'cleanup')   return 'is-cleanup';
    if (s === 'confirmed') return 'is-confirmed';
    if (s === 'upcoming')  return 'is-upcoming';
    return '';
  }

  // Für den Tisch-Picker im Dialog: alle (nicht gemergten Partner)
  availableTables(): PlacedTable[] {
    const r = this.room();
    if (!r) return [];
    return r.tables;
  }

  // ── Tisch-Verfügbarkeit für gewählte Uhrzeit ──────────────────────────
  readonly tablePickerReservation = computed(() => {
    const id = this.tablePickerFor();
    if (!id) return null;
    return this.allReservationsForDay().find(r => r.id === id) ?? null;
  });

  private toMin(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Gibt true zurück wenn am Tisch zum gewünschten Zeitfenster
   * bereits eine andere Reservierung eingetragen ist (reine Zeitkollision,
   * unabhängig von der Personenzahl).
   */
  isTableOccupied(
    tableId: number,
    time: string,
    durationMinutes: number,
    excludeId?: string | null,
  ): boolean {
    if (!time) return false;
    const newStart = this.toMin(time);
    for (const r of (this.reservationsByTableForForm().get(tableId) ?? [])) {
      if (excludeId && r.id === excludeId) continue;
      const resStart = this.toMin(r.time);
      const resEnd   = resStart + r.durationMinutes;
      if (newStart >= resStart && newStart < resEnd) return true;
    }
    return false;
  }

  /** Gibt true zurück wenn mindestens einer der ausgewählten Tische
   *  zum aktuell gewählten Zeitfenster bereits belegt ist.
   */
  isAnySelectedTableOccupied(): boolean {
    return (this.form.tableIds ?? []).some(id =>
      this.isTableOccupied(id, this.form.time, this.form.durationMinutes, this.editingId()),
    );
  }

  /** ID des ersten ausgewählten, aber belegten Tisches — oder null. */
  firstOccupiedSelectedTableId(): number | null {
    return (this.form.tableIds ?? []).find(id =>
      this.isTableOccupied(id, this.form.time, this.form.durationMinutes, this.editingId()),
    ) ?? null;
  }

  /**
   * Gibt true zurück wenn der Tisch alleine nicht genug Plätze für
   * die Personenzahl hat (→ Zusammenführung nötig).
   */
  isTableTooSmall(tableId: number, partySize: number): boolean {
    const table = this.room()?.tables.find(t => t.id === tableId);
    return !!table && table.seats < partySize;
  }

  /** @deprecated Nur noch intern — verwende isTableOccupied. */
  isTableFullAt(
    tableId: number,
    time: string,
    durationMinutes: number,
    partySize: number,
    excludeId?: string | null,
  ): boolean {
    return this.isTableOccupied(tableId, time, durationMinutes, excludeId);
  }

  tableLabel(tableId: number): string {
    const r = this.room();
    if (!r) return '';
    const t = r.tables.find(x => x.id === tableId);
    if (!t) return `Tisch ${tableId}`;
    const typeLabel = t.type === 'round' ? 'Rund' : t.type === 'square' ? 'Eckig' : 'Lang';
    return `${typeLabel} · ${t.seats} Pl.`;
  }

  // ── Aktionslabels ─────────────────────────────────────────────────────
  statusLabel(status: FloorReservationStatus): string { return STATUS_LABELS[status]; }
}
