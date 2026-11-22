import { Component, computed, effect, ElementRef, HostListener, inject, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule, MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, of, startWith, switchMap, take, distinctUntilChanged, catchError } from 'rxjs';
import { RoomsService } from '../../services/rooms.service';
import { FloorReservationsService } from '../../services/floor-reservations.service';
import { ReservationsService } from '../../services/reservations.service';
import { StatusColorsService } from '../../services/status-colors.service';
import { ReservationTimingService } from '../../services/reservation-timing.service';
import { GuestsService, Guest } from '../../services/guests.service';
import { TenantSettingsService, ConfigItem } from '../../services/tenant-settings.service';
import { OpeningHoursService, DayHours, SpecialClosing } from '../../services/opening-hours.service';
import { RoomBlocksService, VenueBlock } from '../../services/room-blocks.service';
import { TableBlockService, TableBlock } from '../../services/table-block.service';
import { localDateIso } from '../../shared/local-date.util';
import { PlacedTable, PlacedWall, PlacedDecor, TableType, DecorType, SavedRoom } from '../../services/room.types';
import { FloorReservation, FloorReservationStatus, STATUS_LABELS } from '../../services/floor-reservation.types';
import { Reservation } from '../../services/reservation.types';
import { StatusIconComponent } from '../../shared/status-icon/status-icon.component';
import { GetraenkeReminderService } from '../../services/getraenke-reminder.service';
import { WaitlistService, WaitlistEntry, WaitlistEntryStatus } from '../../services/waitlist.service';
import { VerifiedStaff } from '../../services/staff.service';
import { StaffIdPromptComponent } from '../../shared/staff-id-prompt/staff-id-prompt.component';
import { TranslateModule } from '@ngx-translate/core';
import { LayoutService } from '../../layout/layout.service';

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
    DecimalPipe,
    TranslateModule,
    StaffIdPromptComponent,
  ],
  templateUrl: './raum-detail.component.html',
  styleUrl: './raum-detail.component.scss'
})
export class RaumDetailComponent implements OnInit, OnDestroy {
  readonly layout                      = inject(LayoutService);
  private readonly roomsService        = inject(RoomsService);
  readonly reservationsService          = inject(FloorReservationsService);
  private readonly apiReservations     = inject(ReservationsService);
  private readonly statusColors        = inject(StatusColorsService);
  private readonly timing              = inject(ReservationTimingService);
  private readonly guestsService       = inject(GuestsService);
  private readonly waitlistService     = inject(WaitlistService);
  private readonly tenantSettings      = inject(TenantSettingsService);
  private readonly ohService           = inject(OpeningHoursService);
  private readonly roomBlocksSvc       = inject(RoomBlocksService);
  private readonly route               = inject(ActivatedRoute);
  private readonly router              = inject(Router);
  readonly getraenke                   = inject(GetraenkeReminderService);
  readonly tableBlockSvc               = inject(TableBlockService);

  // ── Mitarbeiter-ID-Abfrage (Audit-Trail für Stornieren/No-Show/Anlegen) ──
  /** Schalter aus den Tenant-Settings (/einstellungen/rechte). */
  staffIdCheckEnabled = signal<boolean>(false);
  staffPromptOpen = signal(false);
  private pendingStaffAction: ((performedBy: { employeeNumber: number; name: string }) => void) | null = null;

  /**
   * Führt `action` aus — falls die Mitarbeiter-ID-Abfrage aktiv ist, wird vorher
   * die Mitarbeiter-Nummer abgefragt und erst nach Bestätigung ausgeführt.
   */
  private requestStaffIdThen(action: (performedBy?: { employeeNumber: number; name: string }) => void): void {
    if (!this.staffIdCheckEnabled()) {
      action();
      return;
    }
    this.pendingStaffAction = (performedBy) => action(performedBy);
    this.staffPromptOpen.set(true);
  }

  onStaffPromptConfirmed(staff: VerifiedStaff & { employeeNumber: number }): void {
    this.staffPromptOpen.set(false);
    const fn = this.pendingStaffAction;
    this.pendingStaffAction = null;
    fn?.({ employeeNumber: staff.employeeNumber, name: staff.name });
  }

  onStaffPromptCancelled(): void {
    this.staffPromptOpen.set(false);
    this.pendingStaffAction = null;
    // Falls die Abfrage aus dem Speichern-Dialog kam und abgebrochen wurde,
    // Speichern-Button wieder freigeben (sonst bliebe er dauerhaft gesperrt).
    this.formSaving.set(false);
  }

  // ── Tischplan Pan & Zoom ─────────────────────────────────────────────────

  @ViewChild('planCanvas') planCanvasRef?: ElementRef<HTMLDivElement>;

  private readonly PLAN_PAN_KEY  = 'salyseat_plan_pan_enabled';
  private readonly PLAN_ZOOM_KEY = 'salyseat_plan_zoom_enabled';

  /** Plan verschiebbar (persönliche Einstellung, localStorage). */
  planPanEnabled = signal<boolean>(
    localStorage.getItem(this.PLAN_PAN_KEY) === 'true'
  );

  /** Zoom-Buttons (+/−) sichtbar (persönliche Einstellung, localStorage). */
  planZoomBtnEnabled = signal<boolean>(
    localStorage.getItem(this.PLAN_ZOOM_KEY) === 'true'
  );

  /** Ist irgendeine Transform-Funktion aktiv? (für canvas-inner + overflow) */
  planAnyActive = computed(() => this.planPanEnabled() || this.planZoomBtnEnabled());

  /** Einstellungs-Modal offen? */
  planSettingsOpen = signal(false);

  /** Freie Slots Panel im Tischplan aufgeklappt? */
  planFreeSlotsOpen = signal(false);

  /** Pan/Zoom-State */
  planPanX = signal(0);
  planPanY = signal(0);
  planZoom = signal(1);

  readonly PLAN_ZOOM_MIN = 0.3;
  readonly PLAN_ZOOM_MAX = 3;

  planTransform = computed(() =>
    `translate(${this.planPanX()}px, ${this.planPanY()}px) scale(${this.planZoom()})`
  );

  togglePlanPan(enabled: boolean) {
    this.planPanEnabled.set(enabled);
    localStorage.setItem(this.PLAN_PAN_KEY, String(enabled));
    if (!enabled && !this.planZoomBtnEnabled()) {
      this.planPanX.set(0); this.planPanY.set(0); this.planZoom.set(1);
    }
  }

  togglePlanZoom(enabled: boolean) {
    this.planZoomBtnEnabled.set(enabled);
    localStorage.setItem(this.PLAN_ZOOM_KEY, String(enabled));
    if (!enabled && !this.planPanEnabled()) {
      this.planPanX.set(0); this.planPanY.set(0); this.planZoom.set(1);
    }
  }

  planZoomIn()    { this.planZoom.update(z => Math.min(this.PLAN_ZOOM_MAX, +(z + 0.15).toFixed(2))); }
  planZoomOut()   { this.planZoom.update(z => Math.max(this.PLAN_ZOOM_MIN, +(z - 0.15).toFixed(2))); }
  planZoomReset() { this.planPanX.set(0); this.planPanY.set(0); this.planZoom.set(1); }

  onPlanWheel(event: WheelEvent) {
    if (!this.planAnyActive()) return;
    const el = this.planCanvasRef?.nativeElement;
    if (!el) return;

    if (event.ctrlKey && this.planZoomBtnEnabled()) {
      // Pinch / Ctrl+Scroll → Zoom
      event.preventDefault();
      const rect   = el.getBoundingClientRect();
      const mx     = event.clientX - rect.left;
      const my     = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZ   = Math.min(this.PLAN_ZOOM_MAX, Math.max(this.PLAN_ZOOM_MIN, this.planZoom() * factor));
      this.planPanX.update(p => mx - (mx - p) * (newZ / this.planZoom()));
      this.planPanY.update(p => my - (my - p) * (newZ / this.planZoom()));
      this.planZoom.set(+newZ.toFixed(3));
    } else if (!event.ctrlKey && this.planPanEnabled()) {
      // Zwei-Finger-Scroll → Pan
      event.preventDefault();
      this.planPanX.update(p => p - event.deltaX);
      this.planPanY.update(p => p - event.deltaY);
    }
  }

  // Touch-Pan auf dem Tischplan (1-Finger pan, 2-Finger pinch)
  private planTouchPan: { id: number; lastX: number; lastY: number } | null = null;
  private planPinch: { id0: number; id1: number; lastDist: number; lastMidX: number; lastMidY: number } | null = null;

  onPlanTouchStart(event: TouchEvent) {
    if (!this.planAnyActive()) return;
    // Kein Pan starten wenn Touch auf einem Tisch oder Merge-Badge landet
    const target = event.target as HTMLElement;
    if (target.closest('.placed-table, .merge-badge')) return;
    if (event.touches.length === 2) {
      event.preventDefault();
      const t0 = event.touches[0], t1 = event.touches[1];
      this.planPinch = {
        id0: t0.identifier, id1: t1.identifier,
        lastDist: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
        lastMidX: (t0.clientX + t1.clientX) / 2,
        lastMidY: (t0.clientY + t1.clientY) / 2,
      };
      this.planTouchPan = null;
    } else if (event.touches.length === 1) {
      const t = event.touches[0];
      this.planTouchPan = { id: t.identifier, lastX: t.clientX, lastY: t.clientY };
    }
  }

  onPlanTouchMove(event: TouchEvent) {
    if (!this.planAnyActive()) return;
    const el = this.planCanvasRef?.nativeElement;
    if (!el) return;

    if (this.planPinch && event.touches.length === 2 && this.planZoomBtnEnabled()) {
      event.preventDefault();
      const t0 = Array.from(event.touches).find(t => t.identifier === this.planPinch!.id0);
      const t1 = Array.from(event.touches).find(t => t.identifier === this.planPinch!.id1);
      if (!t0 || !t1) return;
      const rect  = el.getBoundingClientRect();
      const dist  = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const midX  = (t0.clientX + t1.clientX) / 2 - rect.left;
      const midY  = (t0.clientY + t1.clientY) / 2 - rect.top;
      const scale = dist / this.planPinch.lastDist;
      const newZ  = Math.min(this.PLAN_ZOOM_MAX, Math.max(this.PLAN_ZOOM_MIN, this.planZoom() * scale));
      this.planPanX.update(p => midX - (midX - p) * (newZ / this.planZoom()));
      this.planPanY.update(p => midY - (midY - p) * (newZ / this.planZoom()));
      this.planZoom.set(+newZ.toFixed(3));
      if (this.planPanEnabled()) {
        const prevMidX = this.planPinch.lastMidX - rect.left;
        const prevMidY = this.planPinch.lastMidY - rect.top;
        this.planPanX.update(p => p + midX - prevMidX);
        this.planPanY.update(p => p + midY - prevMidY);
      }
      this.planPinch.lastDist = dist;
      this.planPinch.lastMidX = (t0.clientX + t1.clientX) / 2;
      this.planPinch.lastMidY = (t0.clientY + t1.clientY) / 2;
    } else if (this.planTouchPan && event.touches.length === 1 && this.planPanEnabled()) {
      event.preventDefault();
      const t = Array.from(event.touches).find(t => t.identifier === this.planTouchPan!.id);
      if (!t) return;
      this.planPanX.update(p => p + t.clientX - this.planTouchPan!.lastX);
      this.planPanY.update(p => p + t.clientY - this.planTouchPan!.lastY);
      this.planTouchPan.lastX = t.clientX;
      this.planTouchPan.lastY = t.clientY;
    }
  }

  onPlanTouchEnd() {
    this.planPinch    = null;
    this.planTouchPan = null;
  }

  // ── Timeline-Übersicht ────────────────────────────────────────────────────
  showTimeline = signal(localStorage.getItem('raum-detail:view') === 'timeline');

  toggleView(): void {
    const next = !this.showTimeline();
    this.showTimeline.set(next);
    localStorage.setItem('raum-detail:view', next ? 'timeline' : 'plan');
  }

  // 24px pro 30-Min-Slot
  readonly tlSlotPx = 24;

  // Vollständige Öffnungszeiten – gesetzt sobald die API antwortet
  allDayHours = signal<DayHours[]>([]);
  // Sonderschließungen (z.B. Feiertage, Betriebsferien)
  specialClosings = signal<SpecialClosing[]>([]);
  venueBlocks     = signal<VenueBlock[]>([]);

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
    // Bereits vergangene Slots ausblenden — aber nur, wenn der ausgewählte
    // Tag "heute" ist. Ein Slot gilt erst als vorbei, wenn auch sein Ende
    // in der Vergangenheit liegt — der gerade laufende Slot (z.B. 12:00
    // bei 12:09 Uhr) bleibt also weiterhin buchbar.
    const nowMin = this.selectedDate() === this.todayIso()
      ? (() => { const n = new Date(this.now()); return n.getHours() * 60 + n.getMinutes(); })()
      : -1;
    const defaultDur = this.timing.defaultDurationMinutes();
    const result: Array<{
      time: string;
      freeCount: number;
      /** Anzahl der freien Tische, die aktuell nur kürzer als die Standarddauer verfügbar sind. */
      limitedCount: number;
      /** Kleinste verfügbare Dauer unter den eingeschränkten Tischen — für den Hinweistext. */
      minAvailableMinutes: number | null;
    }> = [];
    for (const slot of this.tlSlots) {
      const [sh, sm] = slot.split(':').map(Number);
      const sStart = sh * 60 + sm;
      const sEnd   = sStart + 30;
      if (sEnd <= nowMin) continue;

      let freeCount = 0;
      let limitedCount = 0;
      let minAvailableMinutes: number | null = null;

      for (const t of tables) {
        // activeResForTable() liefert bewusst ALLE Status (auch cancelled/
        // no-show/completed) für die Timeline-Darstellung — für die reine
        // Verfügbarkeits-Zählung dürfen die aber keinen Tisch blockieren.
        const activeRes = this.activeResForTable(t.id)
          .filter(r => !['cancelled', 'completed', 'no-show'].includes(r.status));
        const { blocked, availableMinutes } = this.tableAvailabilityAt(t.id, slot, null, activeRes, this.selectedDate());
        if (blocked) continue;
        freeCount++;
        if (availableMinutes !== null && availableMinutes < defaultDur) {
          limitedCount++;
          if (minAvailableMinutes === null || availableMinutes < minAvailableMinutes) {
            minAvailableMinutes = availableMinutes;
          }
        }
      }

      if (freeCount > 0) result.push({ time: slot, freeCount, limitedCount, minAvailableMinutes });
    }
    return result;
  });

  availableGasttypen = signal<ConfigItem[]>([]);
  availableHinweise  = signal<ConfigItem[]>([]);

  readonly STATUS_LABELS = STATUS_LABELS;
  readonly layoutLoading = signal(false);

  /** Personen-Karten: 1–6, darüber → Eingabefeld */
  readonly partyOptions = Array.from({ length: 6 }, (_, i) => i + 1);

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

  /** "2× Bday Feier, 1× Aperitif" — für Badge-Tooltip. */
  packageSummary(res: FloorReservation): string {
    return (res.packages ?? [])
      .map(p => `${p.quantity}× ${p.packageName}`)
      .join(', ');
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

  /** Kurzes Label für enge UI-Elemente (Status-Badge). */
  shortLabelFor(status: FloorReservationStatus): string {
    return this.statusColors.shortLabelForReservation(status);
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

    // statusFilter beim Raum- oder Datumswechsel zurücksetzen — sonst bleibt
    // z. B. "nur Storniert" aktiv und im neuen Raum/Tag erscheinen scheinbar
    // gar keine Reservierungen, obwohl welche vorhanden sind.
    effect(() => {
      const room = this.room();
      const date = this.selectedDate();
      if (!room) return;
      const key = `${room.id}|${date}`;
      if (this._statusFilterResetKey !== null && this._statusFilterResetKey !== key) {
        this.statusFilter.set('active');
      }
      this._statusFilterResetKey = key;
    }, { allowSignalWrites: true });

    // Beim Öffnen eines Raums (bzw. Wechsel auf einen anderen Raum, oder wenn
    // sich das Layout seit dem letzten Besuch geändert hat — z.B. Element im
    // restaurant-plan verschoben) die Ansicht automatisch so verschieben,
    // dass das oberste Element ganz oben und das linkeste Element ganz links
    // anliegt — man muss also nicht erst manuell dorthin scrollen. Reagiert
    // bewusst auf eine LAYOUT-SIGNATUR (Positionen aller Elemente) statt nur
    // auf die Raum-ID, sonst würde beim erneuten Öffnen desselben (in dieser
    // Session bereits besuchten) Raums die alte, evtl. veraltete Pan-Position
    // stehen bleiben. Bei unverändertem Layout (z.B. nur eine Reservierung
    // aktualisiert) ändert sich die Signatur nicht → kein Spring-Effekt
    // während der normalen Nutzung.
    effect(() => {
      const room = this.room();
      if (!room) return;
      const sig = this.planLayoutSignature(room);
      if (sig === this.autoFitSignature) return;
      this.autoFitSignature = sig;
      this.autoFitPlanView(room);
    }, { allowSignalWrites: true });

    // Getränke-Timer/-Alerts sind zwar jetzt im Browser persistiert (siehe
    // GetraenkeReminderService), aber für neu geladene Reservierungen ohne
    // vorhandenen Eintrag (z. B. Check-in in einem anderen Browser/Gerät)
    // muss trotzdem einmal gestartet werden — startTimer() ist ein no-op,
    // wenn schon ein Timer/Alert für die Reservierung existiert.
    // Umgekehrt: Reservierungen, die den Tisch inzwischen verlassen haben
    // (z. B. automatischer Checkout um 23:57 rein backend-seitig, ganz ohne
    // Frontend-Aktion), räumen wir hier auf, statt einen verwaisten Eintrag
    // im Local Storage zu behalten.
    effect(() => {
      for (const res of this.reservationsService.reservations()) {
        const stillSeated = res.status === 'seated' || res.status === 'late' || res.status === 'expired';
        if (stillSeated) {
          this.getraenke.startTimer(res.id);
        } else {
          this.getraenke.cancelTimer(res.id);
        }
      }
    });
  }

  /** Zuletzt für Auto-Fit verarbeitete Layout-Signatur (siehe Effect im Constructor). */
  private autoFitSignature: string | null = null;

  /** Fingerprint aus Raum-ID + Positionen aller Elemente — ändert sich nur, wenn sich das Layout wirklich verändert hat. */
  private planLayoutSignature(room: { id: string; tables: PlacedTable[]; walls: PlacedWall[]; decors: PlacedDecor[] }): string {
    const t = room.tables.map(x => `${x.id}:${x.x},${x.y}`).join('|');
    const w = room.walls.map(x => `${x.id}:${x.x},${x.y},${x.length}`).join('|');
    const d = room.decors.map(x => `${x.id}:${x.x},${x.y}`).join('|');
    return `${room.id}#${t}#${w}#${d}`;
  }

  /**
   * Verschiebt planPanX/planPanY so, dass das oberste/linkeste Element des
   * Raums direkt (mit etwas Abstand) an der oberen linken Ecke des sichtbaren
   * Tischplan-Bereichs anliegt, statt bei der rohen Canvas-Koordinate (0,0)
   * zu starten — Elemente können mittlerweile auch negative x/y haben.
   */
  private autoFitPlanView(room: { tables: PlacedTable[]; walls: PlacedWall[]; decors: PlacedDecor[] }): void {
    const xs: number[] = [];
    const ys: number[] = [];
    room.tables.forEach(t => { xs.push(t.x); ys.push(t.y); });
    room.walls.forEach(w => { xs.push(w.x - w.length / 2); ys.push(w.y - 8); });
    room.decors.forEach(d => { xs.push(d.x); ys.push(d.y); });

    if (!xs.length) { this.planPanX.set(0); this.planPanY.set(0); return; }

    const PAD = 24;
    this.planPanX.set(-Math.min(...xs) + PAD);
    this.planPanY.set(-Math.min(...ys) + PAD);
  }

  /** True, sobald die Venue-Liste vom Backend bestätigt wurde. */
  readonly venuesLoaded = this.roomsService.loaded;

  ngOnDestroy(): void {
    // Toggle-Button wieder aus der Sidebar-Fußzeile entfernen, sobald die
    // Seite verlassen wird.
    this.layout.resPanelToggleVisible.set(false);

    // Offene Timer aufräumen — sonst feuert z. B. ein Long-Press-Timeout noch
    // nach dem Verlassen der Seite und hinterlässt Stuck-State (Drag-Modus,
    // Suggestions-Liste) beim nächsten Öffnen der Komponente.
    if (this.tlLongPressTimer) { clearTimeout(this.tlLongPressTimer); this.tlLongPressTimer = null; }
    if (this.longPressTimer)   { clearTimeout(this.longPressTimer);   this.longPressTimer = null; }
    if (this.searchTimeout)    { clearTimeout(this.searchTimeout);    this.searchTimeout = null; }
  }

  ngOnInit(): void {
    // Res-Panel-Toggle in der Sidebar-Fußzeile nur zeigen, während diese
    // Seite aktiv ist.
    this.layout.resPanelToggleVisible.set(true);
    this.tenantSettings.load().subscribe(s => {
      if (s.gasttypen?.length) this.availableGasttypen.set(s.gasttypen);
      if (s.hinweise?.length)  this.availableHinweise.set(s.hinweise);
      this.staffIdCheckEnabled.set(!!s.staffIdCheck?.enabled);
    });

    // xmove-Parameter nur beim ersten Aufruf auslesen (snapshot reicht hier)
    const xmove     = this.route.snapshot.queryParamMap.get('xmove');
    const xbackend  = this.route.snapshot.queryParamMap.get('xbackend') ?? '';
    const fromTable = this.route.snapshot.queryParamMap.get('fromTable');
    const guestName = this.route.snapshot.queryParamMap.get('guestName') ?? '';
    let xmoveHandled = false;

    // Hotelgast-Prefill: Neue Reservierung sofort vorausgefüllt öffnen
    const prefillName  = this.route.snapshot.queryParamMap.get('prefillName') ?? '';
    const prefillEmail = this.route.snapshot.queryParamMap.get('prefillEmail') ?? '';
    const prefillPhone = this.route.snapshot.queryParamMap.get('prefillPhone') ?? '';
    const prefillSize  = parseInt(this.route.snapshot.queryParamMap.get('prefillSize') ?? '2', 10);
    const prefillSource     = this.route.snapshot.queryParamMap.get('source') ?? '';
    const prefillRoomNumber = this.route.snapshot.queryParamMap.get('roomNumber') ?? '';
    let prefillHandled = false;

    // paramMap als Observable abonnieren – damit wird loadRoomLayout AUCH beim
    // Raum-Wechsel (Tab-Klick) erneut ausgeführt, weil Angular die Komponente
    // wiederverwendet und ngOnInit nicht nochmal aufruft.
    this.route.paramMap.pipe(
      distinctUntilChanged((a, b) => a.get('id') === b.get('id')),
      switchMap(params => {
        const id = params.get('id');
        if (!id) return of(null);
        this.layoutLoading.set(true);
        this.ohService.getHours(id).subscribe(days => {
          this.allDayHours.set(days);
          this.closedWeekdays.set(days.filter(d => !d.open).map(d => d.weekday));
        });
        this.ohService.getSpecialClosings(id).subscribe(closings => this.specialClosings.set(closings));
        this.roomBlocksSvc.getBlocks(id).subscribe(blocks => this.venueBlocks.set(blocks));

        // Bei Direktaufruf von /raum/:id ist die Venue-Liste evtl. noch leer,
        // weil sonst nur /raum sie lädt. Erst Räume holen, dann das Layout.
        const ensureRooms$ = this.roomsService.loaded()
          ? of(null)
          : this.roomsService.load();

        return ensureRooms$.pipe(
          switchMap(() => this.roomsService.loadRoomLayout(id)),
          switchMap(() => of(id)),
        );
      }),
    ).subscribe({
      next: id => {
        if (!id) return;
        this.layoutLoading.set(false);
        this.syncFromBackend(id, this.selectedDate());
        this.tableBlockSvc.loadForVenue(id).subscribe();
        this.loadWaitlistEntries(id);

        // xmove nur einmal beim ersten Laden aktivieren
        if (!xmoveHandled && xmove && fromTable) {
          xmoveHandled = true;
          this.crossMoveMode.set({
            reservationId: xmove,
            backendId:     xbackend,
            fromTableId:   parseInt(fromTable, 10),
            guestName,
          });
          this.router.navigate([], { queryParams: {}, replaceUrl: true });
        }

        // Hotelgast-Prefill: Dialog einmalig vorausgefüllt öffnen
        if (!prefillHandled && prefillName) {
          prefillHandled = true;
          this.router.navigate([], { queryParams: {}, replaceUrl: true });
          setTimeout(() => this.openNewDialog({
            guestName:  prefillName,
            guestEmail: prefillEmail,
            phone:      prefillPhone,
            partySize:  prefillSize || 2,
            source:     prefillSource || undefined,
            roomNumber: prefillRoomNumber || undefined,
          }), 50);
        }
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
    const iso = this.selectedDate();
    const sc = this.specialClosings().find(s => iso >= s.date_from && iso <= s.date_to);
    if (sc?.full_day) return true;
    const [y, m, d] = iso.split('-').map(Number);
    const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7;
    return this.closedWeekdays().includes(weekday);
  });

  readonly dateFilter = (d: Date | null): boolean => {
    if (!d) return true;
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const sc = this.specialClosings().find(s => iso >= s.date_from && iso <= s.date_to);
    if (sc?.full_day) return false;
    const weekday = (d.getDay() + 6) % 7;
    return !this.closedWeekdays().includes(weekday);
  };

  // ── Reservierungs-State ────────────────────────────────────────────────
  selectedDate    = signal<string>(this.todayIso());
  statusFilter    = signal<StatusFilter>('active');
  /** Letzter "room-id|date"-Schlüssel — zum Erkennen eines Raum-/Datumswechsels (siehe Konstruktor). */
  private _statusFilterResetKey: string | null = null;
  sortDir         = signal<'default' | 'asc' | 'desc'>('default');
  filterPanelOpen = signal(false);

  // ── Widget-Warteliste (Gäste, die sich für einen ausgebuchten Slot im
  //    Widget eingetragen haben — eigenständige Daten, keine Reservierungen) ──
  waitlistEntries    = signal<WaitlistEntry[]>([]);
  waitlistLoading    = signal(false);
  waitlistUpdatingId = signal<string | null>(null);

  readonly waitlistOpenEntries = computed(() =>
    this.waitlistEntries().filter(e => e.status === 'waiting' || e.status === 'notified')
  );

  /**
   * Bildet Widget-Warteliste-Einträge als FloorReservation-artige Zeilen ab,
   * damit sie ganz normal in der nach Uhrzeit gruppierten Liste erscheinen
   * (Status 'upcoming' → bestehendes "Warteliste"-Badge). Rein clientseitig —
   * es werden KEINE echten Reservierungen angelegt (kein Tisch, keine Beleg-
   * ung), daher tauchen sie auch nicht in reservationsByTable/Timeline auf.
   * `source: 'waitlist'` markiert sie, damit Klick-Handler/Aktionen sie
   * anders behandeln als echte Reservierungen.
   */
  private readonly waitlistAsReservations = computed<FloorReservation[]>(() => {
    const date = this.selectedDate();
    return this.waitlistEntries()
      .filter(e => (e.status === 'waiting' || e.status === 'notified'))
      .filter(e => e.requested_at.slice(0, 10) === date)
      .map(e => ({
        id:              'wl:' + e.id,
        roomId:          e.venue_id,
        guestName:       e.guest_name,
        guestEmail:      e.guest_email,
        phone:           e.guest_phone ?? undefined,
        notes:           e.notes ?? undefined,
        partySize:       e.party_size,
        date,
        time:            new Date(e.requested_at).toTimeString().slice(0, 5),
        durationMinutes: this.timing.defaultDurationMinutes(),
        tableId:         undefined,
        tableIds:        [],
        status:          'upcoming' as const,
        source:          'waitlist',
        createdAt:       new Date(e.created_at).getTime(),
        updatedAt:       new Date(e.created_at).getTime(),
      }));
  });

  /** Findet den ursprünglichen Warteliste-Eintrag zu einer synthetischen Zeile. */
  waitlistEntryFor(res: FloorReservation): WaitlistEntry | undefined {
    if (res.source !== 'waitlist') return undefined;
    const id = res.id.slice('wl:'.length);
    return this.waitlistEntries().find(e => e.id === id);
  }

  private loadWaitlistEntries(venueId: string): void {
    this.waitlistLoading.set(true);
    this.waitlistService.list(undefined, venueId).subscribe({
      next: res => { this.waitlistEntries.set(res.entries); this.waitlistLoading.set(false); },
      error: () => { this.waitlistLoading.set(false); },
    });
  }

  setWaitlistStatus(entry: WaitlistEntry, status: WaitlistEntryStatus): void {
    this.waitlistUpdatingId.set(entry.id);
    this.waitlistService.updateStatus(entry.id, status).subscribe({
      next: res => {
        this.waitlistEntries.update(list => list.map(e => e.id === entry.id ? res.entry : e));
        this.waitlistUpdatingId.set(null);
      },
      error: () => { this.waitlistUpdatingId.set(null); },
    });
  }

  /** Öffnet den bestehenden Neue-Reservierung-Dialog, vorausgefüllt mit den Warteliste-Daten. */
  convertWaitlistToReservation(entry: WaitlistEntry): void {
    const requested = new Date(entry.requested_at);
    const iso  = `${requested.getFullYear()}-${String(requested.getMonth() + 1).padStart(2, '0')}-${String(requested.getDate()).padStart(2, '0')}`;
    const time = `${String(requested.getHours()).padStart(2, '0')}:${String(requested.getMinutes()).padStart(2, '0')}`;
    this.selectedDate.set(iso);
    this.waitlistConversionEntryId = entry.id;
    this.openNewDialog({
      guestName:  entry.guest_name,
      guestEmail: entry.guest_email,
      phone:      entry.guest_phone ?? '',
      partySize:  entry.party_size,
      time,
      notes:      entry.notes ?? '',
    });
  }

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
          // Ohne catchError würde ein einzelner fehlgeschlagener Request (z. B.
          // kurzer Netzwerk-/Backend-Hänger) den kompletten Signal-Stream für
          // immer stilllegen — erst ein voller Seiten-Reload hätte ihn wieder
          // zum Laufen gebracht. Stattdessen: Fehler abfangen, leere Liste
          // zurückgeben, Stream bleibt für künftige room/formDate-Änderungen aktiv.
          catchError(() => {
            console.warn('Dialog-Reservierungen: Laden fehlgeschlagen, Stream bleibt aktiv.');
            return of<Reservation[]>([]);
          }),
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
    const closedWds  = this.closedWeekdays();    // Signal-Abhängigkeit
    const specials   = this.specialClosings();   // Signal-Abhängigkeit

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
      closed: boolean; open: boolean;
    }[] = [];

    const makeCell = (iso: string, day: number, cur: boolean) => {
      const isPast  = iso < today;
      const isToday = iso === today;
      // hasAvailableSlotsForDate prüft Wochentag-Schließung, Sonderschließung,
      // Öffnungszeiten UND ob heute noch Slots in der Zukunft liegen.
      const isClosed = !isPast && !this.hasAvailableSlotsForDate(iso);
      const isOpen   = !isPast && !isClosed && cur;
      return { iso, day, cur, past: isPast, isToday, sel: iso === sel,
               disabled: isPast || isClosed, closed: isClosed, open: isOpen };
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
   * - Vergangene Uhrzeiten werden heute ausgeblendet (außer beim Bearbeiten einer
   *   bestehenden Reservierung — dort sollen auch frühere Uhrzeiten wählbar bleiben,
   *   damit man eine Reservierung auf einen früheren Zeitpunkt verschieben kann).
   * - Slots wo alle Tische des Raums bereits belegt sind werden ausgeblendet.
   */
  readonly filteredTimeSlots = computed<string[]>(() => {
    const step     = this.tenantSettings.snapshot.widgetFunctional?.intervall ?? 30;
    const duration = this.formDurationMinutes();
    const formDateVal = this.formDate();
    const isEditing = this.editingId() !== null;

    const all: string[] = [];
    for (let h = 8; h < 24; h++) {
      for (let m = 0; m < 60; m += step) {
        all.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }

    // Öffnungszeiten des gewählten Tages ermitteln
    let slots = all;
    {
      const [fy, fm, fd] = formDateVal.split('-').map(Number);
      const weekday = (new Date(fy, fm - 1, fd).getDay() + 6) % 7;
      const sc = this.specialClosings().find(s => formDateVal >= s.date_from && formDateVal <= s.date_to);

      // Venue-Sperrzeit prüfen
      const vb = this.venueBlocks().find(b => formDateVal >= b.date_from && formDateVal <= b.date_to);
      if (vb?.full_day) return [];

      if (sc?.full_day) {
        // Vollständig geschlossen → keine Slots
        return [];
      }

      let openMin: number | null = null;
      let closeMin: number | null = null;

      if (sc && !sc.full_day && sc.open_time && sc.close_time) {
        // Sonder-Öffnungszeiten (z.B. Silvester kürzer)
        const [oh, om] = sc.open_time.split(':').map(Number);
        const [ch, cm] = sc.close_time.split(':').map(Number);
        openMin  = oh * 60 + om;
        closeMin = ch * 60 + cm;
      } else if (!sc) {
        // Reguläre Wochentagszeiten
        const dayHours = this.allDayHours().find(h => h.weekday === weekday);
        if (dayHours && !dayHours.open) return [];
        if (dayHours?.open_time && dayHours?.close_time) {
          const [oh, om] = dayHours.open_time.split(':').map(Number);
          const [ch, cm] = dayHours.close_time.split(':').map(Number);
          openMin  = oh * 60 + om;
          closeMin = ch * 60 + cm;
        }
      }

      if (openMin !== null && closeMin !== null) {
        const oMin = openMin;
        const cMin = closeMin;
        slots = slots.filter(slot => {
          const [h, m] = slot.split(':').map(Number);
          const t = h * 60 + m;
          return t >= oMin && t < cMin;
        });
      }

      // Zeitfenster-Sperren des Raums herausfiltern
      if (vb && !vb.full_day && vb.time_from && vb.time_to) {
        const [bfh, bfm] = vb.time_from.split(':').map(Number);
        const [bth, btm] = vb.time_to.split(':').map(Number);
        const blockFrom = bfh * 60 + bfm;
        const blockTo   = bth * 60 + btm;
        slots = slots.filter(slot => {
          const [h, m] = slot.split(':').map(Number);
          const t = h * 60 + m;
          return t < blockFrom || t >= blockTo;
        });
      }
    }

    // Vergangene Slots heute ausblenden — beim Bearbeiten einer bestehenden
    // Reservierung nicht, damit auch auf eine frühere Uhrzeit verschoben werden kann.
    // Der zuletzt vergangene Slot bleibt zusätzlich wählbar (nicht nur die Slots
    // in der Zukunft): kommt JETZT ein Walk-in rein, würde sonst z. B. um 8:35 Uhr
    // nur noch 9:00 zur Auswahl stehen, obwohl 8:30 (der passende, gerade
    // verstrichene Slot) eigentlich die richtige Uhrzeit wäre.
    if (!isEditing && formDateVal === this.todayIso()) {
      const now = new Date();
      const cur = now.getHours() * 60 + now.getMinutes();
      let lastPastIdx = -1;
      slots.forEach((slot, i) => {
        const [h, m] = slot.split(':').map(Number);
        if (h * 60 + m <= cur) lastPastIdx = i;
      });
      slots = slots.filter((slot, i) => {
        const [h, m] = slot.split(':').map(Number);
        return h * 60 + m > cur || i === lastPastIdx;
      });
    }

    // Admin-Modus: belegte Slots NICHT herausfiltern — werden nur markiert.
    return slots;
  });

  /**
   * Zeitslots an denen WIRKLICH jeder Tisch des Raums belegt ist — zur
   * farblichen "Belegt"-Markierung im Picker. Prüft je Tisch nur den
   * Startzeitpunkt selbst (tableAvailabilityAt/isTableStartBlocked), NICHT
   * die gewünschte Dauer der neuen Reservierung — sonst würde eine lange
   * Standarddauer (z. B. 2h) Slots schon Stunden vor der eigentlichen
   * Kollision fälschlich als "Belegt" markieren, obwohl noch eine kürzere
   * Reservierung hineinpassen würde.
   */
  readonly occupiedTimeSlots = computed<Set<string>>(() => {
    const room = this.room();
    const result = new Set<string>();
    const tableIds = room?.tables?.map(t => t.id) ?? [];
    if (tableIds.length === 0) return result;

    // Reaktivität sicherstellen: reservationsByTableForForm hängt indirekt an
    // formDate/reservations, wird hier über isTableStartBlocked() gelesen.
    for (const slotTime of this.filteredTimeSlots()) {
      const allBlocked = tableIds.every(id => this.isTableStartBlocked(id, slotTime, this.editingId()));
      if (allBlocked) result.add(slotTime);
    }
    return result;
  });

  // Dialoge
  newDialogOpen       = signal(false);
  editDialogOpen      = signal(false);
  /** True wenn der Dialog mit einem explizit vorgewählten Tisch geöffnet wurde.
   *  Dann soll onPartySizeChange den Tisch NICHT automatisch wechseln. */
  private tablePreset = false;
  /** Aktueller Schritt im Mobile-Wizard (1–4). Auf Desktop irrelevant. */
  mobileStep          = signal(1);
  readonly mobileStepMax = 4;
  /** Erkennung ob wir auf Mobile sind (≤ 640px) — für [hidden]-Binding. */
  isMobile            = signal(typeof window !== 'undefined' && window.innerWidth <= 640);

  @HostListener('window:resize')
  onResize(): void { this.isMobile.set(window.innerWidth <= 640); }

  /** Reservierungs-Panel (linke Spalte) auf Tablet ein-/ausklappbar machen,
   *  damit auf dem iPad mehr Platz für den Tischplan bleibt. Auf Desktop
   *  und Mobile ohne Wirkung (dort per CSS ausgeblendet/ignoriert). State
   *  liegt im LayoutService, damit der Toggle-Button in der Sidebar-Fußzeile
   *  denselben Stand anzeigen/steuern kann. */
  resPanelCollapsed = this.layout.resPanelCollapsed;

  tablePickerFor      = signal<string | null>(null);
  editingId           = signal<string | null>(null);
  editingReservation  = signal<FloorReservation | null>(null);
  formError           = signal<string | null>(null);
  formSubmitAttempted = signal(false);
  /**
   * true während ein Speichern-Request (Create/Update) läuft — verhindert
   * Doppel-Buchungen durch mehrfaches schnelles Klicken auf Speichern/Buchen.
   */
  formSaving          = signal(false);

  // ── Konflikt-Dialog (belegter Zeitslot) ──────────────────────────────────
  slotConflictOpen        = signal(false);
  /** Alle aktiven Reservierungen die mit dem gewünschten Slot überlappen */
  slotConflictingRes      = signal<FloorReservation[]>([]);
  /**
   * Minuten die dem Tisch ab der gewählten Uhrzeit noch frei zur Verfügung
   * stehen, bevor die überlappende Reservierung beginnt — für den
   * "Tisch ist noch X frei"-Hinweis im Konflikt-Dialog. Null = Startzeitpunkt
   * selbst ist bereits belegt (kein zusätzlicher Hinweis sinnvoll).
   */
  slotConflictAvailableMinutes = signal<number | null>(null);
  /** Gespeicherte Parameter für den pending Create-Aufruf nach Nutzerentscheidung */
  private _pendingCreate: (() => void) | null = null;
  /**
   * ID des Wartelisten-Eintrags, aus dem der aktuell offene Formular-Dialog
   * heraus geöffnet wurde (convertWaitlistToReservation). Wird nach
   * erfolgreichem Anlegen der Reservierung auf 'converted' gesetzt, damit
   * derselbe Eintrag nicht mehrfach von unterschiedlichen Mitarbeitern in
   * eine Reservierung umgewandelt werden kann.
   */
  private waitlistConversionEntryId: string | null = null;

  // Kundenkarte-Modal (Klick auf res-row__body)
  showKundenConfirm = signal(false);
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
  gcPaymentLoading = signal(false);
  gcPaymentResult  = signal<'captured' | 'released' | 'error' | null>(null);

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
    if (res.source === 'waitlist') return;
    this.guestCardRes.set(res);
    this.gcName.set(res.guestName);
    this.gcPhone.set(res.phone ?? '');
    // Backend-Platzhalter (…@noemail.local) nie als "echte" E-Mail anzeigen/vorbelegen.
    this.gcEmail.set(this.isRealEmail(res.guestEmail ?? '') ? res.guestEmail! : '');
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

  closeGuestCard(): void {
    this.guestCardOpen.set(false);
    this.showKundenConfirm.set(false);
  }

  toggleKundenConfirm(): void {
    if (!this.guestCardRes()?.guestId) return;
    this.showKundenConfirm.update(v => !v);
  }

  navigateToKunde(): void {
    const guestId = this.guestCardRes()?.guestId;
    if (!guestId) return;
    this.closeGuestCard();
    this.router.navigate(['/einstellungen/kunden'], { queryParams: { guest: guestId } });
  }

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
  guestSuggestions      = signal<Guest[]>([]);
  showSuggestions       = signal(false);  // Dropdown unter Vorname
  showSuggestionsNachname = signal(false); // Dropdown unter Nachname
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
    source:     '' as string,
    roomNumber: '' as string,
  };

  /** Reaktives Signal für die Formulardauer — damit filteredTimeSlots darauf reagiert. */
  readonly formDurationMinutes = signal<number>(90);

  // ── Abgeleitete Listen ────────────────────────────────────────────────
  allReservationsForDay = computed(() => {
    const r = this.room();
    if (!r) return [];
    // reservations-Signal abonnieren, damit computed auf Änderungen reagiert
    this.reservationsService.reservations();
    return [
      ...this.reservationsService.forRoomAndDate(r.id, this.selectedDate()),
      ...this.waitlistAsReservations(),
    ];
  });

  filteredReservations = computed(() => {
    const list = this.allReservationsForDay();
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

  /**
   * Reservierungen für das Dialog-Datum (formDate) — unabhängig vom Haupt-Kalender.
   * Enthält zusätzlich den VORTAG: eine späte RV (z. B. 22:00 Start, 6h Dauer)
   * kann über Mitternacht hinaus in formDate() hineinreichen — ohne den Vortag
   * mit einzubeziehen, würde der Tisch am Folgetag früh morgens fälschlich als
   * frei erscheinen (nur für Verfügbarkeits-/Konflikt-Berechnung relevant,
   * s. reservationsByTableForForm() — NICHT für Anzeige-Listen verwenden, da
   * die Vortags-Einträge sonst am falschen Tag doppelt auftauchen würden).
   */
  private readonly allReservationsForFormDay = computed(() => {
    const room = this.room();
    if (!room) return [];
    this.reservationsService.reservations(); // Reaktivität sicherstellen
    const date = this.formDate();
    const prevDate = this.addDaysToIso(date, -1);
    return [
      ...this.reservationsService.forRoomAndDate(room.id, prevDate),
      ...this.reservationsService.forRoomAndDate(room.id, date),
    ];
  });

  private readonly reservationsByTableForForm = computed(() => {
    const map = new Map<number, FloorReservation[]>();
    for (const r of this.allReservationsForFormDay()) {
      if (r.status !== 'upcoming' && r.status !== 'confirmed' && r.status !== 'late' &&
          r.status !== 'seated'   && r.status !== 'expired'  && r.status !== 'cleanup') continue;
      // Optimistisch angelegte Reservierungen (noch kein backendId) ausschließen —
      // verhindert den kurzen "Tisch besetzt"-Flash direkt nach dem Anlegen.
      if (!r.backendId) continue;
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
    resId:         string;
    type:          'move' | 'resize';
    startClientY:  number;
    startValue:    number;  // Minuten ab Mitternacht (move) oder durationMinutes (resize)
    colHeightPx:   number;
    totalMinutes:  number;
    moved:         boolean;
    sourceTableId: number;  // Ursprungs-Tisch für Horizontal-Drag
  } | null = null;

  /** Tisch-ID über dem der Pointer gerade schwebt (für Highlight + finales Umbuchen) */
  readonly tlDragTargetTableId = signal<number | null>(null);

  private tlDragLastSnapped = -1;
  private suppressTlClick   = false;

  // ── Long-Press für Touch-Drag ─────────────────────────────────────────────
  private tlLongPressTimer: ReturnType<typeof setTimeout> | null = null;
  private tlLongPressPending: {
    res:         FloorReservation;
    startX:      number;
    startY:      number;
    col:         HTMLElement;
    target:      HTMLElement;
    pointerId:   number;
    pointerType: string;
  } | null = null;
  readonly tlLongPressResId = signal<string | null>(null);

  private tlClearLongPress(): void {
    if (this.tlLongPressTimer) { clearTimeout(this.tlLongPressTimer); this.tlLongPressTimer = null; }
    this.tlLongPressPending = null;
    this.tlLongPressResId.set(null);
  }

  onTlResPointerDown(event: PointerEvent, res: FloorReservation, type: 'move' | 'resize'): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.isResHistoric(res)) return;

    const target = event.target as HTMLElement;
    const col    = target.closest<HTMLElement>('.tl-col');
    if (!col) return;

    // ── Resize: sofort starten (kleiner Handle, keine Scroll-Ambiguität) ──
    if (type === 'resize') {
      try { target.setPointerCapture(event.pointerId); } catch { /* ignore */ }
      const startValue = res.durationMinutes;
      const resTableId = res.tableIds?.length ? res.tableIds[0] : (res.tableId ?? 0);
      this.reservationsService.beginDrag();
      this.tlDrag = {
        resId: res.id, type: 'resize',
        startClientY: event.clientY, startValue,
        colHeightPx:  col.getBoundingClientRect().height,
        totalMinutes: (this.tlEndH - this.tlStartH) * 60,
        moved: true,
        sourceTableId: resTableId,
      };
      this.tlDragTargetTableId.set(resTableId);
      this.tlDragLastSnapped = startValue;
      return;
    }

    // ── Move: 250 ms Long-Press für alle Eingaben (Maus + Touch) ────────
    this.tlClearLongPress();
    this.tlLongPressPending = { res, startX: event.clientX, startY: event.clientY, col, target, pointerId: event.pointerId, pointerType: event.pointerType };

    this.tlLongPressTimer = setTimeout(() => {
      this.tlLongPressTimer = null;
      const pending = this.tlLongPressPending;
      if (!pending) return;

      // Glow-Animation auslösen
      this.tlLongPressResId.set(pending.res.id);

      // Drag direkt starten — Pointer-Capture damit pointermove überall ankommt
      try { pending.target.setPointerCapture(pending.pointerId); } catch { /* ignore */ }
      const [h, m]   = pending.res.time.split(':').map(Number);
      const startValue = h * 60 + m;
      const srcTableId = pending.res.tableIds?.length ? pending.res.tableIds[0] : (pending.res.tableId ?? 0);
      this.reservationsService.beginDrag();
      this.tlDrag = {
        resId:         pending.res.id,
        type:          'move',
        startClientY:  pending.startY,
        startValue,
        colHeightPx:   pending.col.getBoundingClientRect().height,
        totalMinutes:  (this.tlEndH - this.tlStartH) * 60,
        moved:         false,
        sourceTableId: srcTableId,
      };
      this.tlDragTargetTableId.set(srcTableId);
      this.tlDragLastSnapped = startValue;
      this.tlLongPressPending = null;
    }, 250);
  }

  @HostListener('document:pointermove', ['$event'])
  onDocPointerMove(event: PointerEvent): void {
    // Long-Press abbrechen wenn zu weit bewegt — Maus großzügiger (15px) als Touch (8px)
    if (this.tlLongPressPending) {
      const dx        = event.clientX - this.tlLongPressPending.startX;
      const dy        = event.clientY - this.tlLongPressPending.startY;
      const threshold = this.tlLongPressPending.pointerType === 'mouse' ? 15 : 8;
      if (Math.sqrt(dx * dx + dy * dy) > threshold) this.tlClearLongPress();
      if (this.tlLongPressPending) return; // Timer läuft noch, warten
    }

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

    // Horizontal: welche tl-col liegt unter dem Pointer? → Tisch-Wechsel
    if (drag.type === 'move' && drag.moved) {
      const els = document.elementsFromPoint(event.clientX, event.clientY);
      const colEl = els.find(el => (el as HTMLElement).dataset?.['tableId']) as HTMLElement | undefined;
      if (colEl) {
        const hoveredTableId = parseInt(colEl.dataset['tableId']!, 10);
        if (hoveredTableId && hoveredTableId !== this.tlDragTargetTableId()) {
          this.tlDragTargetTableId.set(hoveredTableId);
          const mergedIds = this.getMergedTableIds(hoveredTableId, this.room()?.tables ?? []);
          this.reservationsService.update(drag.resId, { tableId: mergedIds[0], tableIds: mergedIds });
        }
      }
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
    this.tlClearLongPress();
    this.reservationsService.endDrag();
    const drag = this.tlDrag;
    if (!drag) return;
    if (drag.moved) this.suppressTlClick = true;
    this.tlDrag = null;
    if (!drag.moved) return;

    const finalTableId = this.tlDragTargetTableId();
    this.tlDragTargetTableId.set(null);

    const res = this.reservationsService.reservations().find(r => r.id === drag.resId);
    if (!res?.backendId) return;

    const startsAt = `${res.date}T${res.time}:00`;
    const payload: Record<string, unknown> = {
      starts_at:        startsAt,
      duration_minutes: res.durationMinutes,
    };
    // Tisch-Wechsel nur wenn tatsächlich auf anderen Tisch gezogen
    if (finalTableId && finalTableId !== drag.sourceTableId) {
      const mergedIds = this.getMergedTableIds(finalTableId, this.room()?.tables ?? []);
      payload['table_id']  = mergedIds[0];
      payload['table_ids'] = mergedIds;
    }
    this.apiReservations.update(res.backendId, payload)
      .subscribe({ error: () => console.warn('Timeline-Drag-Sync fehlgeschlagen') });
  }

  @HostListener('document:pointercancel')
  onDocPointerCancel(): void { this.tlClearLongPress(); this.reservationsService.endDrag(); this.tlDrag = null; this.tlDragTargetTableId.set(null); }

  onTlResClick(res: FloorReservation): void {
    if (this.suppressTlClick) { this.suppressTlClick = false; return; }
    this.openGuestCard(res);
  }

  // ── Tagesverlauf (kleine Sparkline-Punkte pro Stunde) ─────────────────
  /** Aktiv angeklickte Stunde in der Load-Bar (null = keine) */
  activeLoadHour = signal<number | null>(null);

  toggleLoadHour(hour: number): void {
    this.activeLoadHour.set(this.activeLoadHour() === hour ? null : hour);
  }

  dayLoad = computed<Array<{ hour: number; count: number; guests: number; isPeak: boolean; pct: number; loadLevel: 'empty' | 'green' | 'amber' | 'red' }>>(() => {
    const buckets      = new Map<number, number>(); // Anzahl Reservierungen
    const guestBuckets = new Map<number, number>();
    const tableBuckets = new Map<number, number>();  // Anzahl belegter Tische (Zusammenlegungen zählen mehrfach)
    for (const r of this.allReservationsForDay()) {
      if (r.status === 'cancelled' || r.status === 'no-show') continue;
      const [hh, mm] = r.time.split(':').map(v => parseInt(v, 10));
      const startMinutes = hh * 60 + (mm || 0);
      const durationMinutes = r.durationMinutes > 0 ? r.durationMinutes : this.timing.defaultDurationMinutes();
      const endMinutes = startMinutes + durationMinutes;
      const startHour = Math.floor(startMinutes / 60);
      // Endstunde exklusiv, aber min. 1 Stunde belegt zählen
      const endHour = Math.max(startHour + 1, Math.ceil(endMinutes / 60));
      // Bei zusammengelegten Tischen belegt EINE Reservierung MEHRERE Tische
      // gleichzeitig — für die Auslastung zählt die Tischanzahl, nicht die
      // Reservierung selbst (sonst wird bei Zusammenlegungen unterzählt).
      const occupiedTables = r.tableIds?.length ? r.tableIds.length : (r.tableId ? 1 : 0);
      for (let h = startHour; h < endHour; h++) {
        buckets.set(h, (buckets.get(h) ?? 0) + 1);
        guestBuckets.set(h, (guestBuckets.get(h) ?? 0) + (r.partySize ?? 0));
        if (occupiedTables > 0) {
          tableBuckets.set(h, (tableBuckets.get(h) ?? 0) + occupiedTables);
        }
      }
    }
    const totalTables = Math.max(1, this.room()?.tables.length ?? 1);
    const max = Math.max(1, ...tableBuckets.values());
    const result: Array<{ hour: number; count: number; guests: number; isPeak: boolean; pct: number; loadLevel: 'empty' | 'green' | 'amber' | 'red' }> = [];
    for (let h = 11; h <= 23; h++) {
      const count    = buckets.get(h) ?? 0;
      const guests   = guestBuckets.get(h) ?? 0;
      const occupied = tableBuckets.get(h) ?? 0;
      const pct = Math.min(100, Math.round((occupied / totalTables) * 100));
      const loadLevel = occupied === 0 ? 'empty' : pct <= 40 ? 'green' : pct <= 70 ? 'amber' : 'red';
      result.push({ hour: h, count, guests, isPeak: occupied === max && occupied > 0, pct, loadLevel });
    }
    return result;
  });

  // ── Sortiergewicht pro Status ─────────────────────────────────────────
  // Reihenfolge: Warteliste immer ganz oben (muss erst bestätigt werden,
  // unabhängig von der Uhrzeit), dann Abgelaufen, dann Verspätet, dann
  // Bevorstehend, dann Aktiv — der Rest (Reinigung/Beendet/Storniert/
  // No-Show) ist untereinander egal. Gilt nur für die Standard-Sortierung —
  // im Tab "Alle" mit aktivem Filter greift stattdessen die Filterung.
  private statusSortWeight(status: FloorReservationStatus): number {
    switch (status) {
      case 'upcoming':   return 0; // Warteliste ganz oben
      case 'expired':    return 1; // Abgelaufen
      case 'late':        return 2; // Verspätet
      case 'confirmed':  return 3; // Bevorstehend
      case 'seated':     return 4; // Aktiv
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
    // default = Status-Gewicht primär, Uhrzeit asc sekundär (wie bisher).
    // asc / desc = explizit vom Nutzer gewählt → rein nach Uhrzeit sortieren.
    const dir = this.sortDir();
    const sorted = [...this.filteredReservations()].sort((a, b) => {
      if (dir === 'default') {
        const sw = this.statusSortWeight(a.status) - this.statusSortWeight(b.status);
        if (sw !== 0) return sw;
        return a.time.localeCompare(b.time);
      }
      const timeCmp = a.time.localeCompare(b.time);
      return dir === 'asc' ? timeCmp : -timeCmp;
    });

    // 2. In Stunden-Gruppen zusammenfassen.
    //
    // Wichtig: Warteliste (Gewicht 0) und Abgelaufen (Gewicht 1) müssen laut
    // Vorgabe IMMER unabhängig von der Uhrzeit ganz oben stehen — auch wenn
    // ihre Stunde sonst nur "normale" Reservierungen (Bevorstehend/Aktiv/...)
    // enthält. Würde man sie einfach in ihre normale Stunden-Gruppe mischen,
    // würde diese GANZE Gruppe (samt niedriger priorisierten Geschwistern)
    // nach oben gezogen — z. B. eine 11-Uhr-Gruppe mit nur einem einzigen
    // Warteliste-Eintrag würde eine 08-Uhr-Gruppe mit einem dringenden
    // "Abgelaufen"-Eintrag nach unten verdrängen, obwohl Abgelaufen dringlicher
    // ist als der Rest der 11-Uhr-Gruppe.
    //
    // Lösung: Warteliste/Abgelaufen-Einträge bekommen jeweils eine eigene
    // Stunden-Gruppe, getrennt von den "normalen" Einträgen derselben Stunde,
    // damit sie keine niedriger priorisierten Geschwister mit nach oben
    // ziehen. Nur im Default-Sortiermodus relevant — bei explizitem
    // Zeit-Sort (asc/desc) zählt ohnehin nur die Uhrzeit.
    const isPromoted = (r: FloorReservation) =>
      dir === 'default' && (r.status === 'upcoming' || r.status === 'expired');

    const groupOrder: string[] = [];
    const groupMap = new Map<string, FloorReservation[]>();
    for (const r of sorted) {
      const hourKey = r.time.split(':')[0] + ':00';
      const key = isPromoted(r) ? `${r.status}|${hourKey}` : hourKey;
      if (!groupMap.has(key)) {
        groupOrder.push(key);
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(r);
    }

    return groupOrder.map(key => ({
      hour: key.includes('|') ? key.split('|')[1] : key,
      reservations: groupMap.get(key)!,
    }));
  });

  // ── Kebab-Menü ────────────────────────────────────────────────────────
  openMenuId = signal<string | null>(null);
  /** true, wenn das Menü nach oben statt nach unten aufklappen soll (zu wenig Platz darunter). */
  openMenuUp = signal<boolean>(false);

  toggleMenu(event: MouseEvent, id: string) {
    event.stopPropagation();
    if (this.openMenuId() === id) {
      this.openMenuId.set(null);
      return;
    }
    // Prüfen, ob unterhalb des Buttons genug Platz für das Menü ist —
    // sonst nach oben aufklappen, damit die Einträge nicht abgeschnitten/
    // vom Scroll-Container verdeckt werden (z. B. bei "Beendet"-RVs weiter unten in der Liste).
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const estimatedMenuHeight = 220; // grobe Obergrenze für bis zu 5 Menü-Einträge
    this.openMenuUp.set(window.innerHeight - rect.bottom < estimatedMenuHeight);
    this.openMenuId.set(id);
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

  /**
   * True, wenn die Reservierung HEUTE über das Buchungs-Widget für HEUTE
   * angelegt wurde (spontaner Online-Gast). Dient nur der visuellen
   * Hervorhebung in der Liste (kleines Blitz-Icon) — keine Business-Logik.
   */
  isFreshOnlineBooking(res: FloorReservation): boolean {
    if (res.source !== 'online') return false;
    if (res.date !== this.todayIso()) return false;
    const created = new Date(res.createdAt);
    const mm = String(created.getMonth() + 1).padStart(2, '0');
    const dd = String(created.getDate()).padStart(2, '0');
    const createdIso = `${created.getFullYear()}-${mm}-${dd}`;
    return createdIso === this.todayIso();
  }

  shiftDate(days: number) {
    const [y, m, d] = this.selectedDate().split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const closed   = this.closedWeekdays();
    const specials = this.specialClosings();
    for (let i = 0; i < 14; i++) {
      dt.setDate(dt.getDate() + days);
      const iso = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      const sc = specials.find(s => iso >= s.date_from && iso <= s.date_to);
      if (!closed.includes((dt.getDay() + 6) % 7) && !sc?.full_day) break;
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

  /** Datumsanzeige für den Bearbeiten-Dialog (dort wird der Kalender ausgeblendet). */
  formDateLabel(): string {
    const iso = this.formDate();
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
    this.form.guestName = (val + ' ' + this.form.nachname).trim();
    this.showSuggestionsNachname.set(false);
    this.onGuestNameInput(val, 'vorname');
  }

  onNachnameInput(val: string): void {
    this.form.guestName = (this.form.vorname + ' ' + val).trim();
    this.showSuggestions.set(false);
    this.onGuestNameInput(val, 'nachname');
  }

  hideSuggestionsDelayed(): void {
    setTimeout(() => {
      this.guestSuggestions.set([]);
      this.showSuggestions.set(false);
      this.showSuggestionsNachname.set(false);
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

  /**
   * Prüft ob ein ISO-Datum noch buchbare Zeitslots hat.
   * Berücksichtigt: Wochentag-Schließung, Sonderschließung, Öffnungszeiten,
   * und für heute ob noch Slots in der Zukunft liegen.
   */
  private hasAvailableSlotsForDate(iso: string): boolean {
    const step = this.tenantSettings.snapshot.widgetFunctional?.intervall ?? 30;
    // Venue-Sperrzeit (ganztägig)?
    const vb = this.venueBlocks().find(b => iso >= b.date_from && iso <= b.date_to);
    if (vb?.full_day) return false;
    // Sonderschließung?
    const sc = this.specialClosings().find(s => iso >= s.date_from && iso <= s.date_to);
    if (sc?.full_day) return false;
    // Wochentag geschlossen?
    const [iy, im, id] = iso.split('-').map(Number);
    const weekday = (new Date(iy, im - 1, id).getDay() + 6) % 7;
    if (!sc) {
      const dayH = this.allDayHours().find(h => h.weekday === weekday);
      if (dayH && !dayH.open) return false;
    }
    // Öffnungszeiten-Fenster bestimmen
    let openMin: number | null = null;
    let closeMin: number | null = null;
    if (sc && !sc.full_day && sc.open_time && sc.close_time) {
      const [oh, om] = sc.open_time.split(':').map(Number);
      const [ch, cm2] = sc.close_time.split(':').map(Number);
      openMin = oh * 60 + om; closeMin = ch * 60 + cm2;
    } else if (!sc) {
      const dayH = this.allDayHours().find(h => h.weekday === weekday);
      if (dayH?.open_time && dayH?.close_time) {
        const [oh, om] = dayH.open_time.split(':').map(Number);
        const [ch, cm2] = dayH.close_time.split(':').map(Number);
        openMin = oh * 60 + om; closeMin = ch * 60 + cm2;
      }
    }
    // Heute: mindestens ein Slot muss noch in der Zukunft liegen
    const nowMin = iso === this.todayIso()
      ? new Date().getHours() * 60 + new Date().getMinutes()
      : -1;
    for (let h = 8; h < 24; h++) {
      for (let m = 0; m < 60; m += step) {
        const t = h * 60 + m;
        if (openMin !== null && closeMin !== null && (t < openMin || t >= closeMin)) continue;
        if (t > nowMin) return true;
      }
    }
    return false;
  }

  /**
   * Findet das erste Datum ab `from` (inkl.) mit verfügbaren Buchungsslots.
   * Sucht max. 60 Tage in die Zukunft.
   */
  private firstAvailableDate(from: string): string {
    const [fy, fm, fd] = from.split('-').map(Number);
    const dt = new Date(fy, fm - 1, fd);
    for (let i = 0; i < 60; i++) {
      const iso = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      if (this.hasAvailableSlotsForDate(iso)) return iso;
      dt.setDate(dt.getDate() + 1);
    }
    return from; // Fallback
  }

  openNewDialog(preset?: Partial<typeof this.form>) {
    // Nächsten verfügbaren Tag ermitteln — heute könnte schon vorbei sein
    const startDate = this.firstAvailableDate(this.selectedDate());
    const [cy, cm] = startDate.split('-').map(Number);
    this.formDate.set(startDate);
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
      source:     '',
      roomNumber: '',
      ...preset,
    };
    // tableIds aus tableId ableiten falls nicht explizit gesetzt
    // → dabei alle zusammengeführten Tische mit einschließen
    if (!this.form.tableIds?.length && this.form.tableId) {
      this.form.tableIds = this.getMergedTableIds(
        this.form.tableId,
        this.room()?.tables ?? []
      );
    }
    // Kein Tisch vorbelegt → besten Tisch automatisch wählen, Flag = false
    // Mit Tisch vorbelegt → Flag = true, kein Auto-Switch bei Personenänderung
    if (!this.form.tableIds?.length && !this.form.tableId) {
      this.tablePreset = false;
      setTimeout(() => this.autoSelectBestTable(), 0);
    } else {
      this.tablePreset = true;
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

  // ── Alle Räume für Tab-Leiste ─────────────────────────────────────────
  readonly allRooms = computed(() => this.roomsService.rooms());

  onRoomTabClick(roomId: string): void {
    if (roomId === this.room()?.id) return;
    const mode = this.reassignMode();
    if (mode) {
      // Raum wechseln und Reservierung dort platzieren
      const res = this.reservationsService.reservations().find(r => r.id === mode.reservationId);
      this.cancelReassign();
      this.router.navigate(['/raum', roomId], {
        queryParams: {
          xmove:     mode.reservationId,
          xbackend:  res?.backendId ?? '',
          fromTable: mode.sourceTableId,
          guestName: res?.guestName ?? '',
        },
      });
    } else {
      this.router.navigate(['/raum', roomId]);
    }
  }

  // ── Raum-übergreifende Umplatzierung ──────────────────────────────────
  crossMoveMode = signal<{ reservationId: string; backendId: string; fromTableId: number; guestName: string } | null>(null);

  crossMoveName = computed(() => this.crossMoveMode()?.guestName ?? '');

  cancelCrossMove(): void {
    this.crossMoveMode.set(null);
    // Query-Params aus URL entfernen
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  doCrossRoomMove(targetTableId: number): void {
    const mode = this.crossMoveMode();
    const room = this.room();
    if (!mode || !room) return;

    // Backend: table_id + venue_id updaten — backendId kommt aus den Query-Params,
    // da die Reservierung im alten Raum geladen war und hier nicht verfügbar ist.
    if (mode.backendId) {
      this.apiReservations.update(mode.backendId, {
        table_id: targetTableId,
        venue_id: room.id,
      }).subscribe({
        next: () => {
          // Nach erfolgreichem Backend-Update Reservierungen neu laden
          this.syncFromBackend(room.id, this.selectedDate());
        },
        error: () => console.warn('Cross-Room-Sync fehlgeschlagen'),
      });
    }

    this.cancelCrossMove();
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

    // Cross-Room-Move: Tisch in neuem Raum als Ziel auswählen
    if (this.crossMoveMode()) {
      this.doCrossRoomMove(tableId);
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
    this.openNewDialog({ tableId, partySize: seats });
  }

  // Timeline-Slot-Klick: Tisch + Uhrzeit vorausgewählt
  openFromSlot(tableId: number, time: string): void {
    const t = this.room()?.tables.find(x => x.id === tableId);
    const seats = t?.seats ?? 2;
    this.openNewDialog({ tableId, time, partySize: seats });
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
    const prev = this.reservationsService.reservations().find(r => r.id === mode.reservationId);
    // Alle zusammengeführten Tische des Ziels einschließen
    const targetIds = this.getMergedTableIds(choice.targetTableId, this.room()?.tables ?? []);
    const primaryId = targetIds[0];
    this.reservationsService.update(mode.reservationId, { tableId: primaryId, tableIds: targetIds });
    this.syncTableToBackend(mode.reservationId, primaryId, targetIds, { tableId: prev?.tableId, tableIds: prev?.tableIds });
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
    // Alle zusammengeführten Tische des Ziels mit einschließen
    const targetMergedIds = this.getMergedTableIds(choice.targetTableId, this.room()?.tables ?? []);
    const newIds = [...new Set([...currentIds, ...targetMergedIds])];
    const primaryId = currentIds[0] ?? targetMergedIds[0];
    this.reservationsService.update(mode.reservationId, { tableIds: newIds, tableId: primaryId });
    this.syncTableToBackend(mode.reservationId, primaryId, newIds, { tableId: res?.tableId, tableIds: res?.tableIds });
    this.reassignChoice.set(null);
    this.reassignMode.set(null);
  }

  /**
   * Quelltisch aus dem Split entfernen — die restlichen Tische bleiben erhalten.
   */
  doMerge(): void {
    const mode   = this.reassignMode();
    const choice = this.reassignChoice();
    if (!mode || !choice) return;
    const res = this.reservationsService.reservations().find(r => r.id === mode.reservationId);
    const currentIds = res?.tableIds?.length ? res.tableIds : (res?.tableId ? [res.tableId] : []);
    // Quelltisch-Gruppe (inkl. Merge-Partner) aus den IDs entfernen
    const sourceGroup = this.getMergedTableIds(mode.sourceTableId, this.room()?.tables ?? []);
    const newIds = currentIds.filter(id => !sourceGroup.includes(id));
    const primaryId = newIds[0] ?? choice.targetTableId;
    this.reservationsService.update(mode.reservationId, { tableId: primaryId, tableIds: newIds });
    this.syncTableToBackend(mode.reservationId, primaryId, newIds, { tableId: res?.tableId, tableIds: res?.tableIds });
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

  /**
   * True wenn der Zieltisch zur Zeit der verschobenen Reservierung bereits belegt ist.
   * Nutzt reservationsByTable (= Tischplan-View), nicht die Formular-Map.
   */
  get reassignTargetOccupied(): boolean {
    const mode   = this.reassignMode();
    const choice = this.reassignChoice();
    if (!mode || !choice) return false;
    const res = this.reservationsService.reservations().find(r => r.id === mode.reservationId);
    if (!res) return false;
    const resStart = this.toMin(res.time);
    const resDur   = res.durationMinutes > 0 ? res.durationMinutes : this.timing.defaultDurationMinutes();
    const resEnd   = resStart + resDur;
    const targetList = this.reservationsByTable().get(choice.targetTableId) ?? [];
    return targetList.some(r => {
      if (r.id === mode.reservationId) return false;
      const rStart = this.toMin(r.time);
      const rDur   = r.durationMinutes > 0 ? r.durationMinutes : this.timing.defaultDurationMinutes();
      return resStart < (rStart + rDur) && resEnd > rStart;
    });
  }

  /**
   * Zeigt kurz einen Hinweis an, wenn ein Tisch-Sync fehlgeschlagen ist und
   * die optimistische Änderung zurückgerollt wurde.
   */
  tableSyncError = signal<string | null>(null);

  /**
   * Schreibt Tisch-Zuweisung + tableIds ins Backend. Die lokale Änderung ist
   * bereits optimistisch angewendet (vom Aufrufer) — schlägt der Request fehl,
   * würde die UI sonst bis zum nächsten Reload einen Stand zeigen, der dem
   * Server nicht entspricht. Deshalb hier bei Fehler sofort auf `rollback`
   * zurücksetzen, statt nur zu loggen.
   */
  private syncTableToBackend(
    localId: string,
    tableId: number | null,
    tableIds?: number[],
    rollback?: { tableId?: number; tableIds?: number[] },
  ): void {
    const res = this.reservationsService.reservations().find(r => r.id === localId);
    const backendId = res?.backendId;
    if (!backendId) return;
    const payload: any = { table_id: tableId };
    if (tableIds !== undefined) payload.table_ids = tableIds;
    this.apiReservations.update(backendId, payload).subscribe({
      error: () => {
        console.warn('Tisch-Sync fehlgeschlagen für', backendId);
        if (rollback) {
          this.reservationsService.update(localId, {
            tableId:  rollback.tableId,
            tableIds: rollback.tableIds,
          });
        }
        this.tableSyncError.set('Tischänderung konnte nicht gespeichert werden — wurde zurückgenommen.');
        setTimeout(() => this.tableSyncError.set(null), 5000);
      },
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

    // Ganze transitiv verbundene Gruppe trennen (nicht nur den einen direkten
    // Partner) — sonst bleiben bei mehr als 2 gemergten Tischen verwaiste
    // mergedWith-Referenzen zurück.
    const groupIds = this.getMergedTableIds(id, room.tables);

    const newTables = room.tables.map(t => {
      if (groupIds.includes(t.id))
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

  /** Farb-Palette für gesplittete Reservierungen (10 Farben) */
  private readonly SPLIT_COLORS = [
    '#5DCAA5', '#7F77DD', '#EF9F27', '#D4537E',
    '#378ADD', '#D85A30', '#639922', '#BA7517',
    '#1D9E75', '#534AB7',
  ];

  /**
   * Gibt Reservierungen zurück die mehr als einen Tisch belegen (gesplittet).
   * Liefert eine Map reservationId → Farbe.
   */
  readonly splitColorMap = computed(() => {
    const map = new Map<string, string>();
    // Nach createdAt sortieren → ältere RVs bekommen niedrigere Indizes.
    // Stabil: neue Split-RVs bekommen die nächste freie Farbe,
    // bestehende behalten ihre Farbe (createdAt ändert sich nicht).
    const splitRes = this.allReservationsForDay()
      .filter(res => (res.tableIds?.length ?? 0) > 1)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    splitRes.forEach((res, index) => {
      map.set(res.id, this.SPLIT_COLORS[index % this.SPLIT_COLORS.length]);
    });
    return map;
  });

  /** Farbe für eine Reservierung (nur wenn gesplittet, sonst null). */
  splitColor(resId: string): string | null {
    return this.splitColorMap().get(resId) ?? null;
  }

  /** Gibt die Split-Farbe für den ersten gesplitteten Gast an einem Tisch zurück (für Badge). */
  tableSplitColor(tableId: number): string | null {
    const res = this.tableAllActiveReservations(tableId).find(r => this.splitColorMap().has(r.id));
    return res ? (this.splitColorMap().get(res.id) ?? null) : null;
  }

  /** Sitzfarbe im SVG: Split-Farbe wenn vorhanden, sonst Standardblau. */
  tableSeatColor(tableId: number): string {
    return this.tableSplitColor(tableId) ?? '#2979ff';
  }

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

  /** Sichtbare Reservierungen: nur 1 — außer der Tisch ist aufgeklappt. */
  visibleGuestReservations(tableId: number): FloorReservation[] {
    const all = this.tableAllActiveReservations(tableId);
    return this.isGuestsExpanded(tableId) ? all : all.slice(0, 1);
  }

  /** Nur der Vorname (erstes Wort) — damit die Tisch-Chips nicht zu breit werden. */
  firstName(name: string | null | undefined): string {
    return (name ?? '').trim().split(/\s+/)[0] ?? '';
  }

  openSplitPicker(tableId: number, event: MouseEvent): void {
    event.stopPropagation();
    this.splitPickerFor.set(this.splitPickerFor() === tableId ? null : tableId);
  }

  addToSplitTable(reservationId: string): void {
    const tableId = this.splitPickerFor();
    if (!tableId) return;
    const prev = this.reservationsService.reservations().find(r => r.id === reservationId);
    this.reservationsService.update(reservationId, { tableId });
    this.syncTableToBackend(reservationId, tableId, undefined, { tableId: prev?.tableId, tableIds: prev?.tableIds });
    this.splitPickerFor.set(null);
  }

  removeFromTable(reservationId: string, event: MouseEvent): void {
    event.stopPropagation();
    const prev = this.reservationsService.reservations().find(r => r.id === reservationId);
    this.reservationsService.update(reservationId, { tableId: undefined, tableIds: [] });
    this.syncTableToBackend(reservationId, null, undefined, { tableId: prev?.tableId, tableIds: prev?.tableIds });
  }

  @HostListener('document:keyup.escape')
  onEscape(): void {
    if (this.reassignChoice()) { this.reassignChoice.set(null); return; }
    if (this.reassignMode()) this.cancelReassign();
  }

  openEditDialog(res: FloorReservation) {
    const ids = res.tableIds?.length ? res.tableIds : (res.tableId ? [res.tableId] : []);
    // Dialog-Datum auf das tatsächliche Datum der Reservierung setzen — sonst bleibt
    // formDate() auf dem zuletzt für "Neue Reservierung" verwendeten Wert stehen und
    // sowohl die Zeitslot-Filterung als auch die (fehlende) Datumsanzeige beziehen
    // sich auf den falschen Tag.
    this.formDate.set(res.date);
    const [ey, em] = res.date.split('-').map(Number);
    this.calendarYear.set(ey);
    this.calendarMonth.set(em - 1);
    this.form = {
      guestName: res.guestName,
      vorname:   res.guestName,
      nachname:  '',
      // Backend-Platzhalter (…@noemail.local) nie ins Formular vorbelegen.
      guestEmail: this.isRealEmail(res.guestEmail ?? '') ? res.guestEmail! : '',
      partySize: res.partySize,
      time: res.time,
      durationMinutes: res.durationMinutes,
      tableId: res.tableId ?? 0,
      tableIds: ids,
      phone: res.phone ?? '',
      notes: res.notes ?? '',
      isWalkIn: false,
      source:     res.source ?? '',
      roomNumber: res.hotelRoomNumber ?? '',
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
    this.formSaving.set(false);
    this.guestSuggestions.set([]);
    this.showSuggestions.set(false);
    this.mobileStep.set(1);
    this.waitlistConversionEntryId = null;
  }

  nextMobileStep(): void {
    if (this.mobileStep() >= this.mobileStepMax) return;
    // Pflichtfelder des aktuellen Schritts prüfen — sonst kommt man bis Schritt 4
    // (Zusammenfassung/Speichern) durch, obwohl z. B. noch keine Uhrzeit oder
    // kein Name gesetzt ist, und der Fehler zeigt sich erst beim Speichern-Klick.
    if (!this.isMobileStepValid(this.mobileStep())) {
      this.formSubmitAttempted.set(true);
      return;
    }
    this.formSubmitAttempted.set(false);
    this.mobileStep.update(s => s + 1);
  }

  /** Pflichtfeld-Check für den Mobile-Wizard-Schritt `step` (1 = Datum, 2 = Zeit/Personen, 3 = Gastdaten, 4 = Zusammenfassung). */
  private isMobileStepValid(step: number): boolean {
    if (step === 2) {
      return /^\d{2}:\d{2}$/.test(this.form.time) && this.form.partySize >= 1;
    }
    if (step === 3) {
      const name = [this.form.vorname.trim(), this.form.nachname.trim()].filter(Boolean).join(' ').trim();
      return !!name;
    }
    return true;
  }

  prevMobileStep(): void {
    if (this.mobileStep() > 1) this.mobileStep.update(s => s - 1);
  }

  onGuestNameInput(value: string, anchor: 'vorname' | 'nachname' = 'vorname'): void {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    if (value.trim().length < 2) {
      this.guestSuggestions.set([]);
      this.showSuggestions.set(false);
      this.showSuggestionsNachname.set(false);
      return;
    }
    this.searchTimeout = setTimeout(() => {
      this.guestsService.load({ search: value.trim(), limit: 6 }).subscribe(res => {
        this.guestSuggestions.set(res.guests);
        const hasResults = res.guests.length > 0;
        this.showSuggestions.set(anchor === 'vorname' && hasResults);
        this.showSuggestionsNachname.set(anchor === 'nachname' && hasResults);
      });
    }, 200);
  }

  selectGuest(guest: Guest): void {
    const parts          = guest.name.trim().split(/\s+/);
    this.form.vorname    = parts[0] ?? '';
    this.form.nachname   = parts.slice(1).join(' ');
    this.form.guestName  = guest.name;
    this.form.guestEmail = guest.email;
    this.form.phone      = guest.phone ?? '';
    this.guestSuggestions.set([]);
    this.showSuggestions.set(false);
    this.showSuggestionsNachname.set(false);
  }

  /** Gibt true zurück wenn die E-Mail eine echte (nicht generierte) Adresse ist */
  isRealEmail(email: string): boolean {
    if (!email) return false;
    return !email.includes('noemail') && !email.includes('@noemail');
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

  /**
   * Ermittelt aktive lokale Reservierungen, die sich mit dem gewünschten
   * Zeitslot (Datum/Uhrzeit/Dauer) auf einem der gewählten Tische
   * überschneiden. Wird sowohl beim Anlegen als auch beim Bearbeiten
   * verwendet — `excludeId` blendet die gerade bearbeitete RV selbst aus.
   */
  private findConflictingReservations(
    roomId: string,
    dateVal: string,
    time: string,
    durationMinutes: number,
    tableIds: number[],
    excludeId: string | null,
  ): FloorReservation[] {
    const slotStartMs = new Date(`${dateVal}T${time}:00`).getTime();
    const slotEndMs   = slotStartMs + durationMinutes * 60_000;

    // Vortag mit einbeziehen: eine späte RV (z. B. 22:00 Start, 6h Dauer) kann
    // über Mitternacht hinaus in den gewählten Tag hineinreichen — ohne den
    // Vortag zu prüfen, würde ein Konflikt früh morgens am Folgetag nicht
    // erkannt (die RV liegt ja unter dem Vortagsdatum im Backend/State).
    const prevDate = this.addDaysToIso(dateVal, -1);
    const localActive = [
      ...this.reservationsService.forRoomAndDate(roomId, prevDate),
      ...this.reservationsService.forRoomAndDate(roomId, dateVal),
    ]
      .filter(r => r.id !== excludeId)
      .filter(r => !['cancelled', 'completed', 'no-show'].includes(r.status) && !!r.backendId);

    return localActive.filter(r => {
      const rIds = r.tableIds?.length ? r.tableIds : (r.tableId ? [r.tableId] : []);
      // Keine Tischzuweisung (z. B. Warteliste ohne Tisch) → kein Konflikt für
      // einen konkreten Tisch, da diese RV noch keinem Tisch zugeordnet ist.
      if (rIds.length === 0) return false;
      if (!rIds.some(id => tableIds.includes(id))) return false;
      const dur = r.durationMinutes > 0 ? r.durationMinutes : durationMinutes;
      // r.date (nicht dateVal!) als Basis verwenden — r kann durch die
      // Vortags-Erweiterung oben ein anderes Datum als der Suchzeitraum
      // haben. Da s/e absolute Epoch-Zeitstempel sind, funktioniert der
      // Vergleich mit slotStartMs/slotEndMs über die Mitternachtsgrenze
      // hinweg automatisch korrekt.
      const s = new Date(`${r.date}T${r.time}:00`).getTime();
      let e   = s + dur * 60_000;
      // Früher Check-out (Status "cleanup" vor Ablauf der geplanten Dauer): ab
      // dem echten Check-out-Zeitpunkt zählt nur noch die Cleanup-Zeit —
      // nicht mehr die ursprünglich geplante Dauer. Sonst blockiert eine früh
      // ausgecheckte RV den Tisch hier weiterhin bis zum ursprünglich
      // geplanten Ende.
      if (r.status === 'cleanup') {
        const cleanupMinutes = this.timing.cleanupEnabled() ? this.timing.cleanupMinutes() : 0;
        e = (r.checkedOutAt ?? r.updatedAt) + cleanupMinutes * 60_000;
      }
      return s < slotEndMs && e > slotStartMs;
    });
  }

  /** Datum (ISO yyyy-MM-dd) um `delta` Tage verschieben. */
  private addDaysToIso(dateStr: string, delta: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  saveForm() {
    // Doppel-Buchungs-Schutz: solange ein Speichern-Request läuft, keinen
    // weiteren Aufruf zulassen (z. B. durch mehrfaches schnelles Klicken).
    if (this.formSaving()) return;

    const room = this.room();
    if (!room) return;

    this.formError.set(null);
    this.formSubmitAttempted.set(true);

    // Vor- und Nachname zusammensetzen
    this.form.guestName = [this.form.vorname.trim(), this.form.nachname.trim()].filter(Boolean).join(' ');
    const name = this.form.guestName.trim();
    if (!name) { this.formError.set('Bitte gib einen Namen ein.'); return; }
    if (this.form.partySize < 1) { this.formError.set('Personenanzahl muss mindestens 1 sein.'); return; }
    if (!/^\d{2}:\d{2}$/.test(this.form.time)) { this.formError.set('Bitte eine gültige Uhrzeit eingeben.'); return; }

    this.formSaving.set(true);
    const editId  = this.editingId();
    const editing = this.editingReservation();
    // tableIds → tableId (erster Eintrag) synchronisieren
    const primaryTableId = this.form.tableIds[0] ?? 0;
    this.form.tableId  = primaryTableId;

    if (editId && editing) {
      // Status upgraden: wenn jetzt ein Tisch zugewiesen ist und der Gast
      // noch nicht eingecheckt ist, auf "confirmed" (Bevorstehend) wechseln.
      // Umgekehrt: wird der Tisch entfernt, muss auch ein bereits eingecheckter
      // Status (seated/late/cleanup) zurückgestuft werden — sonst bleibt die RV
      // z. B. als "Eingecheckt" markiert, obwohl ihr gar kein Tisch mehr
      // zugeordnet ist.
      const hasTable = !!(primaryTableId || this.form.tableIds.length);
      const currentStatus = editing.status;
      const statusRequiresTable =
        currentStatus === 'confirmed' || currentStatus === 'seated' ||
        currentStatus === 'late'      || currentStatus === 'cleanup';
      const newStatus: FloorReservationStatus | undefined =
        hasTable && currentStatus === 'upcoming'   ? 'confirmed' :
        !hasTable && statusRequiresTable           ? 'upcoming'  : undefined;

      // Datum kann im Bearbeiten-Dialog jetzt über den Kalender geändert werden
      // (Reservierung auf einen anderen Tag verschieben) — formDate() statt des
      // ursprünglichen editing.date verwenden.
      const newDate = this.formDate();

      const applyEdit = () => {
        // Lokalen Floor-State aktualisieren
        this.reservationsService.update(editId, {
          guestName:       name,
          partySize:       this.form.partySize,
          date:            newDate,
          time:            this.form.time,
          durationMinutes: this.form.durationMinutes,
          tableId:         primaryTableId || undefined,
          tableIds:        this.form.tableIds.length ? this.form.tableIds : undefined,
          phone:           this.form.phone.trim() || undefined,
          notes:           this.form.notes.trim() || undefined,
        });

        // Status separat über setStatus() setzen — das aktualisiert nicht nur den
        // lokalen State, sondern synct auch per confirm/reopen-Endpoint ans Backend.
        // Ein reines update()-Patch (s.o.) tut das nicht, der Status wäre sonst nach
        // einem Reload wieder auf dem alten Stand.
        if (newStatus) {
          this.reservationsService.setStatus(editId, newStatus);
        }

        // Status sofort neu bewerten (z. B. Uhrzeit auf früher gesetzt →
        // eingecheckte RV kann jetzt schon "überfällig" sein) — nicht erst
        // beim nächsten 60s-Heartbeat.
        this.timing.recomputeNow();

        // Backend synchronisieren, falls eine Backend-ID verknüpft ist
        if (editing.backendId) {
          const startsAt = `${newDate}T${this.form.time}:00`;
          // Tischzuweisung mitschicken — sonst geht eine im Bearbeiten-Dialog
          // geänderte Tischzuordnung beim nächsten Reload/Sync wieder verloren,
          // da sie sonst nur lokal (reservationsService.update() oben) landet.
          const backendPayload: Record<string, unknown> = {
            guest_name:       name,
            party_size:       this.form.partySize,
            starts_at:        startsAt,
            duration_minutes: this.form.durationMinutes,
            guest_phone:      this.form.phone.trim() || undefined,
            notes:            this.form.notes.trim() || undefined,
            table_id:         primaryTableId || null,
            table_ids:        this.form.tableIds.length ? this.form.tableIds : [],
          };
          this.apiReservations.update(editing.backendId, backendPayload).subscribe({
            error: () => console.warn('Backend-Update fehlgeschlagen, lokale Änderung bleibt.'),
          });
        }

        this.closeFormDialog();
      };

      // Konflikt-Check auch beim Bearbeiten: relevant weil Datum/Uhrzeit/Tisch
      // hier geändert werden können und die RV so mit einer anderen
      // überlappen könnte (vorher nur beim Neuanlegen geprüft).
      if (hasTable) {
        const editTableIds = this.form.tableIds.length ? this.form.tableIds : [primaryTableId];
        const conflicting = this.findConflictingReservations(
          room.id, newDate, this.form.time, this.form.durationMinutes, editTableIds, editId,
        );

        if (conflicting.length > 0) {
          const availMinList = editTableIds
            .map(id => this.availableMinutesAt(id, this.form.time, editId))
            .filter((m): m is number => m !== null && m > 0);
          this._pendingCreate = applyEdit;
          this.slotConflictingRes.set(conflicting);
          this.slotConflictAvailableMinutes.set(availMinList.length ? Math.min(...availMinList) : null);
          this.slotConflictOpen.set(true);
          this.formSaving.set(false);
          return;
        }
      }

      applyEdit();
    } else {
      // Vor dem Anlegen prüfen ob der Slot noch frei ist (frische Backend-Daten).
      const formDateVal  = this.formDate();

      const doCreate = () => {
        this.requestStaffIdThen((performedBy) => {
          this.doCreateReservation(room, name, primaryTableId, formDateVal, performedBy);
        });
      };

      // Kein Tisch gewählt → direkt auf Warteliste, kein Konflikt-Check nötig
      const selectedTableIds = this.form.tableIds;
      if (selectedTableIds.length === 0) {
        doCreate();
        return;
      }

      // Konflikt-Check: überlappende lokale Reservierungen für den gewählten Tisch.
      const conflicting = this.findConflictingReservations(
        room.id, formDateVal, this.form.time, this.form.durationMinutes, selectedTableIds, null,
      );

      if (conflicting.length > 0) {
        // Slot ist belegt → Konfliktdialog öffnen statt direkt zu blocken.
        // Zusätzlich ermitteln wie viele Minuten ab der gewünschten Uhrzeit
        // noch frei sind (falls der Startzeitpunkt selbst frei ist, aber die
        // volle gewünschte Dauer nicht mehr hineinpasst) — für den
        // "Tisch ist noch X frei"-Hinweis im Dialog.
        const availMinList = selectedTableIds
          .map(id => this.availableMinutesAt(id, this.form.time, this.editingId()))
          .filter((m): m is number => m !== null && m > 0);
        this._pendingCreate = doCreate;
        this.slotConflictingRes.set(conflicting);
        this.slotConflictAvailableMinutes.set(availMinList.length ? Math.min(...availMinList) : null);
        this.slotConflictOpen.set(true);
        this.formSaving.set(false);
        return;
      }

      doCreate();
    }
  }

  /** Konflikt-Aktion 1: Trotzdem platzieren (Überbuchung) */
  confirmConflictPlace(): void {
    const fn = this._pendingCreate;
    this.closeConflictDialog();
    this.formSaving.set(true);
    fn?.();
  }

  /** Konflikt-Aktion 2: Abbrechen */
  cancelConflict(): void {
    this.closeConflictDialog();
  }

  /** Konflikt-Aktion 3: Bestehende RVs auschecken, neue einchecken */
  confirmConflictReplace(): void {
    const fn = this._pendingCreate;
    const toCheckout = this.slotConflictingRes();
    this.closeConflictDialog();
    this.formSaving.set(true);

    // Alle überlappenden Reservierungen auf "completed" setzen
    for (const res of toCheckout) {
      this.getraenke.cancelTimer(res.id);
      this.reservationsService.setStatus(res.id, 'completed');
    }

    fn?.();
  }

  private closeConflictDialog(): void {
    this.slotConflictOpen.set(false);
    this.slotConflictingRes.set([]);
    this.slotConflictAvailableMinutes.set(null);
    this._pendingCreate = null;
  }

  private doCreateReservation(
    room: SavedRoom,
    name: string,
    primaryTableId: number,
    formDateVal: string,
    performedBy?: { employeeNumber: number; name: string },
  ) {
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
      table_ids:        this.form.tableIds.length ? this.form.tableIds : undefined,
      source:           isWalkIn ? 'walk_in' : ((this.form.source || 'admin') as 'admin' | 'pms' | 'online' | 'walk_in'),
      room_number:      this.form.roomNumber || undefined,
      performed_by_employee_number: performedBy?.employeeNumber,
    }).subscribe({
      next: res => {
        this.reservationsService.update(local.id, { backendId: res.id });
        this.reservationsService.setStatus(local.id, local.status);
        // Vor closeFormDialog() sichern, da dort waitlistConversionEntryId zurückgesetzt wird.
        const waitlistId = this.waitlistConversionEntryId;
        this.closeFormDialog();
        if (waitlistId) {
          const entry = this.waitlistEntries().find(e => e.id === waitlistId);
          if (entry) this.setWaitlistStatus(entry, 'converted');
        }
      },
      error: (err) => {
        this.reservationsService.remove(local.id);
        const msg = err?.error?.error ?? 'Reservierung konnte nicht gespeichert werden.';
        this.formError.set(msg);
        // Dialog bleibt offen (Fehleranzeige) — Speichern-Button wieder freigeben,
        // damit der Nutzer nach Korrektur erneut versuchen kann.
        this.formSaving.set(false);
      },
    });
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

    // Alle zusammengeführten Tische einsammeln
    const room = this.room();
    const tableIds = this.getMergedTableIds(tableId, room?.tables ?? []);
    const prev = this.reservationsService.reservations().find(r => r.id === id);

    this.reservationsService.update(id, { tableId, tableIds });
    this.syncTableToBackend(id, tableId, undefined, { tableId: prev?.tableId, tableIds: prev?.tableIds });
    this.reservationsService.setStatus(id, 'seated');
    this.getraenke.startTimer(id);
    this.tablePickerFor.set(null);
  }

  /** Gibt die IDs aller Tische zurück die mit tableId zusammengeführt sind (inkl. sich selbst). */
  /** Gibt true zurück wenn der Tisch aktuell mit einem anderen zusammengeführt ist. */
  isTableMerged(tableId: number): boolean {
    const tables = this.room()?.tables ?? [];
    const t = tables.find(x => x.id === tableId);
    if (t?.mergedWith !== undefined) return true;
    return tables.some(x => x.mergedWith === tableId);
  }

  /** Gibt die IDs der Merge-Partner zurück (ohne den Tisch selbst), oder []. */
  mergePartners(tableId: number): number[] {
    return this.getMergedTableIds(tableId, this.room()?.tables ?? [])
      .filter(id => id !== tableId);
  }

  /**
   * Ermittelt alle transitiv über `mergedWith` verbundenen Tische (inkl. sich
   * selbst) per Graph-Traversierung — nicht nur den einen direkten Partner.
   * `mergedWith` ist im Regelfall streng paarweise (die restaurant-plan-
   * Merge-Logik erlaubt keine 3er-Ketten), aber bei importierten/manuell
   * bearbeiteten Layouts oder inkonsistenten Altdaten kann diese Invariante
   * verletzt sein — eine reine 1-Schritt-Suche würde dann verwaiste
   * mergedWith-Referenzen beim Trennen übersehen.
   */
  private getMergedTableIds(tableId: number, tables: PlacedTable[]): number[] {
    const ids = new Set<number>([tableId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of tables) {
        if (ids.has(t.id) && t.mergedWith !== undefined && !ids.has(t.mergedWith)) {
          ids.add(t.mergedWith);
          changed = true;
        }
        if (t.mergedWith !== undefined && ids.has(t.mergedWith) && !ids.has(t.id)) {
          ids.add(t.id);
          changed = true;
        }
      }
    }
    return Array.from(ids);
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
    this.requestStaffIdThen((performedBy) => {
      this.reservationsService.setStatus(res.id, 'no-show', performedBy);
    });
  }

  capturePayment(res: FloorReservation) {
    if (!res.backendId || this.gcPaymentLoading()) return;
    this.gcPaymentLoading.set(true);
    this.gcPaymentResult.set(null);
    this.reservationsService.capturePayment(res.backendId).subscribe({
      next: () => {
        this.gcPaymentLoading.set(false);
        this.gcPaymentResult.set('captured');
        setTimeout(() => this.gcPaymentResult.set(null), 4000);
      },
      error: () => {
        this.gcPaymentLoading.set(false);
        this.gcPaymentResult.set('error');
        setTimeout(() => this.gcPaymentResult.set(null), 4000);
      },
    });
  }

  releasePayment(res: FloorReservation) {
    if (!res.backendId || this.gcPaymentLoading()) return;
    this.gcPaymentLoading.set(true);
    this.gcPaymentResult.set(null);
    this.reservationsService.releasePayment(res.backendId).subscribe({
      next: () => {
        this.gcPaymentLoading.set(false);
        this.gcPaymentResult.set('released');
        setTimeout(() => this.gcPaymentResult.set(null), 4000);
      },
      error: () => {
        this.gcPaymentLoading.set(false);
        this.gcPaymentResult.set('error');
        setTimeout(() => this.gcPaymentResult.set(null), 4000);
      },
    });
  }

  cancel(res: FloorReservation) {
    this.getraenke.cancelTimer(res.id);
    this.requestStaffIdThen((performedBy) => {
      this.reservationsService.setStatus(res.id, 'cancelled', performedBy);
    });
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
    if (type === 'label') return { w: 120, h: 40 };
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

  /** Wechselt einen Tisch in/aus der Mehrfachauswahl.
   *  Zusammengeführte Tische werden immer als Gruppe ein-/ausgewählt. */
  toggleTableSelection(id: number): void {
    if (id === 0) { this.form.tableIds = []; return; }
    const mergedIds = this.getMergedTableIds(id, this.room()?.tables ?? []);
    const isSelected = this.form.tableIds.includes(id);
    if (isSelected) {
      // Alle Merge-Partner raus
      this.form.tableIds = this.form.tableIds.filter(x => !mergedIds.includes(x));
    } else {
      // Alle Merge-Partner rein
      // Wenn der neu gewählte Tisch FREI ist → bestehende belegte Tische raus,
      // damit kein Mischzustand entsteht und die Besetzt-Warnung verschwindet.
      const isNewOccupied = this.isTableOccupied(id, this.form.time, this.form.durationMinutes, this.editingId());
      const base = isNewOccupied
        ? this.form.tableIds
        : this.form.tableIds.filter(x =>
            !this.isTableOccupied(x, this.form.time, this.form.durationMinutes, this.editingId())
          );
      const combined = new Set([...base, ...mergedIds]);
      this.form.tableIds = Array.from(combined);
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

  roomSeats(rm: { tables: { seats: number }[] }): number {
    return rm.tables.reduce((sum, t) => sum + t.seats, 0);
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

  // ── Tisch-Sperren (inline im Plan-Settings-Modal) ────────────────────────

  psBlockSectionOpen = signal(false);

  psFormFor  = signal<{ roomId: string; tableId: number } | null>(null);
  psDateFrom = '';
  psDateTo   = '';
  psFullDay  = true;
  psTimeFrom = '';
  psTimeTo   = '';
  psReason   = '';
  psError    = signal<string | null>(null);
  psSaving   = signal(false);

  psOpenForm(roomId: string, tableId: number) {
    const today = localDateIso();
    this.psDateFrom = today;
    this.psDateTo   = today;
    this.psFullDay  = true;
    this.psTimeFrom = '';
    this.psTimeTo   = '';
    this.psReason   = '';
    this.psError.set(null);
    this.psFormFor.set({ roomId, tableId });
  }

  psSave() {
    const ctx = this.psFormFor();
    if (!ctx || this.psSaving()) return;
    if (!this.psDateFrom || !this.psDateTo) {
      this.psError.set('Bitte Start- und Enddatum angeben.'); return;
    }
    if (this.psDateTo < this.psDateFrom) {
      this.psError.set('Das Enddatum darf nicht vor dem Startdatum liegen.'); return;
    }
    if (!this.psFullDay) {
      if (!this.psTimeFrom || !this.psTimeTo) {
        this.psError.set('Bitte Start- und Endzeit angeben.'); return;
      }
      if (this.psDateFrom === this.psDateTo && this.psTimeTo <= this.psTimeFrom) {
        this.psError.set('Die Endzeit muss nach der Startzeit liegen.'); return;
      }
    }
    this.psSaving.set(true);
    this.psError.set(null);
    this.tableBlockSvc.addBlock(ctx.roomId, {
      tableId:  ctx.tableId,
      dateFrom: this.psDateFrom,
      dateTo:   this.psDateTo,
      fullDay:  this.psFullDay,
      timeFrom: this.psFullDay ? undefined : this.psTimeFrom,
      timeTo:   this.psFullDay ? undefined : this.psTimeTo,
      reason:   this.psReason.trim() || undefined,
    }).subscribe({
      next: () => {
        this.psSaving.set(false);
        this.psFormFor.set(null);
      },
      error: () => {
        this.psSaving.set(false);
        this.psError.set('Fehler beim Speichern der Sperrzeit.');
      },
    });
  }

  // ── Bestätigungs-Modal für Sperrung aufheben ─────────────────────────────
  confirmDeleteBlockId = signal<string | null>(null);

  confirmRemoveBlock(blockId: string, event: Event) {
    event.stopPropagation();
    this.confirmDeleteBlockId.set(blockId);
  }

  executeRemoveBlock() {
    const id = this.confirmDeleteBlockId();
    if (!id) return;
    const venueId = this.room()?.id;
    if (!venueId) { this.confirmDeleteBlockId.set(null); return; }
    this.confirmDeleteBlockId.set(null);
    this.tableBlockSvc.removeBlock(venueId, id).subscribe();
  }

  isBlockActiveNow(b: TableBlock): boolean {
    const now   = new Date();
    const today = localDateIso(now);
    if (today < b.dateFrom || today > b.dateTo) return false;
    if (b.fullDay) return true;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const [fh, fm] = (b.timeFrom ?? '00:00').split(':').map(Number);
    const [th, tm] = (b.timeTo   ?? '23:59').split(':').map(Number);
    return nowMin >= fh * 60 + fm && nowMin < th * 60 + tm;
  }

  formatBlockLabel(b: TableBlock): string {
    const from = b.dateFrom === b.dateTo ? b.dateFrom : `${b.dateFrom} – ${b.dateTo}`;
    if (b.fullDay) return `${from} (ganztägig)`;
    return `${from}  ${b.timeFrom}–${b.timeTo}`;
  }

  isTableBlockedNow(tableId: number): boolean {
    const roomId = this.room()?.id;
    if (!roomId) return false;
    return this.tableBlockSvc.isBlockedNow(roomId, tableId);
  }

  /** Prüft ob der Tisch am aktuell angezeigten Datum gesperrt ist (für Plan-Ansicht). */
  isTableBlockedOnSelectedDate(tableId: number): boolean {
    const roomId = this.room()?.id;
    if (!roomId) return false;
    return this.tableBlockSvc.isBlockedAt(roomId, tableId, this.selectedDate());
  }

  /** Prüft ob der Tisch am Formular-Datum + Formular-Uhrzeit gesperrt ist (für Tisch-Picker). */
  isTableBlockedForForm(tableId: number): boolean {
    const roomId = this.room()?.id;
    if (!roomId) return false;
    return this.tableBlockSvc.isBlockedAt(roomId, tableId, this.formDate(), this.form.time);
  }

  tableBlockReason(tableId: number): string | undefined {
    const roomId = this.room()?.id;
    if (!roomId) return undefined;
    const active = this.tableBlockSvc.blocksForTable(roomId, tableId)
      .find(b => this.tableBlockSvc.isBlockedNow(roomId, tableId));
    return active?.reason;
  }

  tableBlockReasonOnDate(tableId: number): string | undefined {
    const roomId = this.room()?.id;
    if (!roomId) return undefined;
    return this.tableBlockSvc.blocksForTable(roomId, tableId)
      .find(b => this.tableBlockSvc.isBlockedAt(roomId, tableId, this.selectedDate()))
      ?.reason;
  }

  // Für den Tisch-Picker im Dialog: alle (nicht gemergten Partner)
  availableTables(): PlacedTable[] {
    const r = this.room();
    if (!r) return [];
    return r.tables;
  }

  /**
   * Wählt automatisch den besten Tisch für die aktuelle Personenzahl:
   * – kleinster freier Tisch mit seats >= partySize
   * – Fallback: größter verfügbarer Tisch
   * "Frei" bedeutet hier: der Startzeitpunkt selbst ist nicht belegt (s.
   * isTableStartBlocked()) — auch Tische mit nur eingeschränkter Verfügbarkeit
   * (kürzer als die gewünschte Dauer) zählen als wählbar, statt komplett
   * übersprungen zu werden. Unter den Kandidaten werden aber Tische
   * bevorzugt, die die volle gewünschte Dauer abdecken; erst wenn keiner
   * davon passt, wird auf einen mit eingeschränkter Verfügbarkeit ausgewichen.
   */
  private autoSelectBestTable(): void {
    const room = this.room();
    if (!room) return;
    const partySize = this.form.partySize;
    const time      = this.form.time;
    const duration  = this.form.durationMinutes;
    const excludeId = this.editingId();

    const freeTables = room.tables.filter(t =>
      !this.isTableStartBlocked(t.id, time, excludeId)
    );
    if (freeTables.length === 0) return;

    const fullyFits = (t: (typeof freeTables)[number]) => {
      const mins = this.availableMinutesAt(t.id, time, excludeId);
      return mins === null || mins >= duration;
    };

    // Kleinster Tisch der >= partySize ist (optimal fit), stabil nach ID
    // sortiert — Fallback: größter verfügbarer Tisch aus dem jeweiligen Pool.
    const bestFrom = (pool: typeof freeTables) => {
      const fits = pool
        .filter(t => t.seats >= partySize)
        .sort((a, b) => a.seats - b.seats || a.id - b.id);
      return fits[0] ?? [...pool].sort((a, b) => b.seats - a.seats || a.id - b.id)[0];
    };

    const best = bestFrom(freeTables.filter(fullyFits)) ?? bestFrom(freeTables);
    if (!best) return;

    // Auswahl setzen (merged-partner mitberücksichtigen)
    const mergedIds = this.getMergedTableIds(best.id, room.tables);
    this.form.tableIds = mergedIds;
    this.form.tableId  = mergedIds[0] ?? best.id;
  }

  /** Personenzahl setzen — Tisch nur automatisch wechseln wenn kein Tisch vorbelegt war. */
  onPartySizeChange(n: number): void {
    this.form.partySize = n;
    if (!this.tablePreset) {
      this.autoSelectBestTable();
    }
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
   * Absoluter Beginn (Epoch ms) einer Reservierung, aus r.date + r.time.
   * Epoch-basiert statt "Minuten seit Mitternacht des Anfragetags", damit
   * über Mitternacht hinausreichende Reservierungen (spät + lange Dauer)
   * am Folgetag korrekt weiter als belegt erkannt werden — s. addDaysToIso()
   * / allReservationsForFormDay(), die den Vortag mit einbeziehen.
   */
  private reservationStartEpoch(r: FloorReservation): number {
    return new Date(`${r.date}T${r.time}:00`).getTime();
  }

  /**
   * Tatsächliches Belegungsende (Epoch ms): bei frühem Check-out (Status
   * "cleanup") der reale Check-out-Zeitpunkt (r.checkedOutAt, Fallback
   * updatedAt für ältere Daten), sonst die ursprünglich geplante Endzeit
   * (Startzeit + Dauer).
   */
  private effectiveEndEpoch(r: FloorReservation): number {
    return r.status === 'cleanup'
      ? (r.checkedOutAt ?? r.updatedAt)
      : this.reservationStartEpoch(r) + r.durationMinutes * 60_000;
  }

  /**
   * Belegtes Zeitfenster einer Reservierung inkl. Clean-up-Puffer, als
   * Epoch-ms-Intervall.
   */
  private occupiedWindowEpoch(
    r: FloorReservation,
    cleanupBufferMs: number,
  ): { start: number; end: number } {
    if (r.status === 'cleanup') {
      const checkoutEpoch = r.checkedOutAt ?? r.updatedAt;
      // Cleanup-Dauer nur ansetzen, wenn der Cleanup-Schalter aktuell aktiv ist —
      // sonst widerspricht sich diese Blockierung mit isTableInCleanup(), das bei
      // deaktiviertem Schalter sofort false liefert (kein Badge), während der
      // Tisch hier trotzdem noch für die letzte bekannte Cleanup-Dauer als
      // belegt gilt. Bei deaktiviertem Schalter ist der Tisch ab dem
      // Check-out-Zeitpunkt sofort wieder frei.
      const cleanupMs = this.timing.cleanupEnabled() ? this.timing.cleanupMinutes() * 60_000 : 0;
      return { start: checkoutEpoch, end: checkoutEpoch + cleanupMs };
    }
    const start = this.reservationStartEpoch(r);
    const end   = start + r.durationMinutes * 60_000;
    return { start: start - cleanupBufferMs, end: end + cleanupBufferMs };
  }

  /**
   * Verfügbarkeit eines Tisches ab `time` — im Gegensatz zu isTableOccupied()
   * OHNE Berücksichtigung der gewünschten Dauer der NEUEN Reservierung.
   * `blocked` = der Startzeitpunkt selbst liegt in einer bestehenden Belegung
   * (Tisch also zu dieser Uhrzeit gar nicht buchbar). Ist er das nicht, gibt
   * `availableMinutes` an wie viele Minuten bis zur nächsten Reservierung an
   * diesem Tisch noch frei sind (null = an diesem Tag folgt keine weitere
   * Reservierung mehr). So bleibt ein Tisch wählbar, auch wenn nur eine
   * kürzere Reservierung als die aktuell eingestellte Dauer hineinpasst —
   * statt ihn pauschal als "belegt" zu blocken.
   */
  private tableAvailabilityAt(
    tableId: number,
    time: string,
    excludeId?: string | null,
    reservations?: FloorReservation[],
    queryDate?: string,
  ): { blocked: boolean; availableMinutes: number | null } {
    if (!time) return { blocked: false, availableMinutes: null };
    const cleanupBufferMs = (this.timing.cleanupEnabled() ? this.timing.cleanupMinutes() : 0) * 60_000;
    const date = queryDate ?? this.formDate();
    const newStart = new Date(`${date}T${time}:00`).getTime();
    let nextStart: number | null = null;
    // `reservations` erlaubt die Wiederverwendung dieser Logik auch außerhalb
    // des Formularkontexts (z. B. freeSlotsToday auf Basis von
    // activeResForTable() statt reservationsByTableForForm()).
    const list = reservations ?? (this.reservationsByTableForForm().get(tableId) ?? []);
    for (const r of list) {
      if (excludeId && r.id === excludeId) continue;
      const { start: resStart, end: resEnd } = this.occupiedWindowEpoch(r, cleanupBufferMs);
      if (newStart >= resStart && newStart < resEnd) {
        return { blocked: true, availableMinutes: 0 };
      }
      if (resStart > newStart && (nextStart === null || resStart < nextStart)) {
        nextStart = resStart;
      }
    }
    return {
      blocked: false,
      availableMinutes: nextStart === null ? null : Math.round((nextStart - newStart) / 60_000),
    };
  }

  /** Gibt true zurück wenn der Tisch zum Zeitpunkt `time` selbst (unabhängig
   *  von der gewünschten Dauer) bereits belegt ist — also gar nicht buchbar. */
  isTableStartBlocked(
    tableId: number,
    time: string,
    excludeId?: string | null,
  ): boolean {
    return this.tableAvailabilityAt(tableId, time, excludeId).blocked;
  }

  /** Minuten die dem Tisch ab `time` noch frei zur Verfügung stehen, bevor die
   *  nächste Reservierung beginnt — oder null wenn an diesem Tag keine
   *  weitere Reservierung mehr folgt (praktisch unbegrenzt). */
  availableMinutesAt(
    tableId: number,
    time: string,
    excludeId?: string | null,
  ): number | null {
    return this.tableAvailabilityAt(tableId, time, excludeId).availableMinutes;
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
    // Clean-up-Zeit weitet das belegte Fenster der bestehenden Reservierung auf
    // beiden Seiten — 0 (Schalter aus) ergibt exakt die bisherige Berechnung.
    const cleanupBufferMs = (this.timing.cleanupEnabled() ? this.timing.cleanupMinutes() : 0) * 60_000;
    const date = this.formDate();
    const newStart = new Date(`${date}T${time}:00`).getTime();
    // Volles Zeitfenster der NEUEN Reservierung berücksichtigen (nicht nur ihren
    // Start) — sonst wird z. B. eine 9-Uhr-RV mit 2h Dauer nicht als Konflikt
    // erkannt, obwohl sie bis 11 Uhr eine um 10 Uhr bereits bestehende RV
    // überlappt.
    const newEnd = newStart + durationMinutes * 60_000;
    for (const r of (this.reservationsByTableForForm().get(tableId) ?? [])) {
      if (excludeId && r.id === excludeId) continue;
      const { start: resStart, end: resEnd } = this.occupiedWindowEpoch(r, cleanupBufferMs);
      if (newStart < resEnd && newEnd > resStart) return true;
    }
    return false;
  }

  /**
   * Gibt true zurück wenn der Tisch zum gewünschten Zeitpunkt NICHT durch eine
   * aktuell laufende Reservierung belegt ist, sondern nur noch durch die
   * Clean-up-Zeit danach — für eine eigene Kennzeichnung im Tisch-Picker
   * ("Clean-up" statt "Belegt").
   */
  isTableInCleanup(
    tableId: number,
    time: string,
    excludeId?: string | null,
  ): boolean {
    if (!time || !this.timing.cleanupEnabled()) return false;
    const cleanupMs = this.timing.cleanupMinutes() * 60_000;
    const date = this.formDate();
    const newStart = new Date(`${date}T${time}:00`).getTime();
    for (const r of (this.reservationsByTableForForm().get(tableId) ?? [])) {
      if (excludeId && r.id === excludeId) continue;
      // Bei frühem Check-out beginnt die Cleanup-Phase am echten
      // Check-out-Zeitpunkt (checkedOutAt), nicht an der ursprünglich geplanten
      // Endzeit der Reservierung.
      const rawEnd = this.effectiveEndEpoch(r);
      const cleanupEnd = rawEnd + cleanupMs;
      if (newStart >= rawEnd && newStart < cleanupEnd) return true;
    }
    return false;
  }

  /** Gibt true zurück wenn mindestens einer der ausgewählten Tische
   *  zum gewählten Zeitpunkt selbst nicht buchbar ist (unabhängig von der
   *  gewünschten Dauer — s. tableAvailabilityAt()).
   */
  isAnySelectedTableOccupied(): boolean {
    return (this.form.tableIds ?? []).some(id =>
      this.isTableStartBlocked(id, this.form.time, this.editingId()),
    );
  }

  /**
   * Gibt true zurück wenn mindestens einer der gewählten Tische zum Zeitslot
   * `slot` selbst nicht buchbar ist (für die Zeitslot-Farbmarkierung). Reicht
   * die verfügbare Zeit nur für eine KÜRZERE Reservierung als aktuell
   * eingestellt, bleibt der Slot trotzdem wählbar — s. tableAvailabilityAt().
   */
  isSelectedTableOccupiedAt(slot: string): boolean {
    const ids = this.form.tableIds ?? [];
    if (ids.length === 0) return false;
    return ids.some(id => this.isTableStartBlocked(id, slot, this.editingId()));
  }

  /**
   * Gibt true zurück wenn mindestens einer der gewählten Tische zum Zeitslot
   * `slot` nur noch durch die Clean-up-Zeit belegt ist (nicht durch eine
   * aktuell laufende Reservierung) — für die Zeitslot-Farbmarkierung.
   */
  isSelectedTableInCleanupAt(slot: string): boolean {
    const ids = this.form.tableIds ?? [];
    if (ids.length === 0) return false;
    return ids.some(id => this.isTableInCleanup(id, slot, this.editingId()));
  }

  /** ID des ersten ausgewählten, aber belegten Tisches — oder null. */
  firstOccupiedSelectedTableId(): number | null {
    return (this.form.tableIds ?? []).find(id =>
      this.isTableStartBlocked(id, this.form.time, this.editingId()),
    ) ?? null;
  }

  /**
   * Verfügbare Minuten des ersten ausgewählten Tisches ab `slot` (Standard: die
   * aktuell gewählte Uhrzeit) — für den "nur Xh verfügbar"-Hinweis, wenn die
   * gewünschte Dauer nicht ganz hineinpasst. Null = keine Einschränkung an
   * diesem Tag. `slot` erlaubt die Wiederverwendung auch pro Zeitslot-Karte
   * in der Zeitslot-Liste, nicht nur für die aktuell gewählte Uhrzeit.
   */
  firstSelectedTableAvailableMinutes(slot: string = this.form.time): number | null {
    for (const id of (this.form.tableIds ?? [])) {
      const mins = this.availableMinutesAt(id, slot, this.editingId());
      if (mins !== null) return mins;
    }
    return null;
  }

  /** Formatiert Minuten als "1 Std." / "1 Std. 30 Min." / "45 Min." für den Verfügbarkeits-Hinweis. */
  formatAvailableDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} Min.`;
    if (m === 0) return `${h} Std.`;
    return `${h} Std. ${m} Min.`;
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
