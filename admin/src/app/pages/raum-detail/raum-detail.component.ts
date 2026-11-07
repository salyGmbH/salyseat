import { Component, computed, effect, HostListener, inject, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule, MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { RoomsService } from '../../services/rooms.service';
import { FloorReservationsService } from '../../services/floor-reservations.service';
import { ReservationsService } from '../../services/reservations.service';
import { StatusColorsService } from '../../services/status-colors.service';
import { ReservationTimingService } from '../../services/reservation-timing.service';
import { GuestsService, Guest } from '../../services/guests.service';
import { TenantSettingsService, ConfigItem } from '../../services/tenant-settings.service';
import { PlacedTable, TableType, DecorType } from '../../services/room.types';
import { FloorReservation, FloorReservationStatus, STATUS_LABELS } from '../../services/floor-reservation.types';
import { Reservation } from '../../services/reservation.types';
import { StatusIconComponent } from '../../shared/status-icon/status-icon.component';

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
  private readonly route               = inject(ActivatedRoute);
  private readonly router              = inject(Router);

  availableGasttypen = signal<ConfigItem[]>([]);
  availableHinweise  = signal<ConfigItem[]>([]);

  readonly STATUS_LABELS = STATUS_LABELS;
  readonly layoutLoading = signal(false);

  private readonly paramMap = toSignal(this.route.paramMap);

  room = computed(() => {
    const id = this.paramMap()?.get('id');
    return id ? this.roomsService.getRoom(id) : undefined;
  });

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
    // Bei Datumswechsel Backend-Sync wiederholen.
    // effect() muss im Konstruktor stehen (Injection-Context), nicht in ngOnInit.
    effect(() => {
      const date = this.selectedDate();
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
    this.apiReservations.loadForVenue(venueId, date).subscribe(backendList => {
      for (const br of backendList) {
        this.adoptBackendReservation(venueId, br);
      }
    });
  }

  private adoptBackendReservation(venueId: string, br: Reservation): void {
    // Uhrzeit direkt aus dem ISO-String extrahieren (vermeidet Timezone-Probleme)
    const time = br.starts_at.substring(11, 16);
    const date = br.starts_at.substring(0, 10);
    const startsMs = new Date(br.starts_at).getTime();
    const endsMs   = new Date(br.ends_at).getTime();
    const durationMinutes = Math.round((endsMs - startsMs) / 60000);

    const existing = this.reservationsService.reservations()
      .find(r => r.backendId === br.id);

    const guestPatch = {
      guestName:          br.guest_name,
      partySize:          br.party_size,
      time,
      date,
      durationMinutes,
      phone:              br.guest_phone          ?? undefined,
      notes:              br.guest_notes          ?? undefined,
      gasttypen:          br.guest_gasttypen      ?? [],
      hinweise:           br.guest_hinweise       ?? [],
      guestId:            br.guest_id             ?? undefined,
      guestEmail:         br.guest_email          ?? undefined,
      guestInternalNotes: br.guest_internal_notes ?? undefined,
      guestBlocked:       br.guest_blocked        ?? false,
      guestBlockedReason: br.guest_blocked_reason ?? undefined,
    };

    if (existing) {
      this.reservationsService.update(existing.id, guestPatch);
    } else {
      this.reservationsService.add({
        backendId: br.id,
        roomId:    venueId,
        status:    this.mapBackendStatus(br.status),
        ...guestPatch,
      });
    }
  }

  private mapBackendStatus(status: string): FloorReservationStatus {
    if (status === 'confirmed') return 'seated';
    if (status === 'completed') return 'completed';
    if (status === 'cancelled') return 'cancelled';
    if (status === 'no_show')   return 'no-show';
    return 'upcoming';  // pending
  }

  // ── Reservierungs-State ────────────────────────────────────────────────
  selectedDate   = signal<string>(this.todayIso());
  statusFilter   = signal<StatusFilter>('active');

  // Dialoge
  newDialogOpen       = signal(false);
  editDialogOpen      = signal(false);
  tablePickerFor      = signal<string | null>(null);
  editingId           = signal<string | null>(null);
  editingReservation  = signal<FloorReservation | null>(null);
  formError           = signal<string | null>(null);

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
  gcSaving         = signal(false);
  gcError          = signal<string | null>(null);

  openGuestCard(res: FloorReservation): void {
    if (!res.guestId) return;
    this.guestCardRes.set(res);
    this.gcName.set(res.guestName);
    this.gcPhone.set(res.phone ?? '');
    this.gcNotes.set(res.guestInternalNotes ?? '');
    this.gcBlocked.set(res.guestBlocked ?? false);
    this.gcReason.set(res.guestBlockedReason ?? '');
    this.gcGasttypen.set([...(res.gasttypen ?? [])]);
    this.gcHinweise.set([...(res.hinweise ?? [])]);
    this.gcError.set(null);
    this.guestCardOpen.set(true);
  }

  closeGuestCard(): void { this.guestCardOpen.set(false); }

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
    guestEmail: '',
    partySize: 2,
    time: '19:00',
    durationMinutes: 90,
    tableId: 0 as number | 0,
    phone: '',
    notes: '',
    /** True, wenn der Dialog über den Walk-In-Button geöffnet wurde —
     *  in diesem Fall wird die Reservierung beim Speichern direkt auf
     *  Status "seated" gesetzt (statt "upcoming"). */
    isWalkIn: false,
  };

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
    const f = this.statusFilter();
    if (f === 'all') return list;
    // 'active' = alles, was operativ noch im Restaurant ist:
    // Geplant, eingecheckt, Standard-Dauer überschritten ("expired"),
    // oder Tisch wird gerade gereinigt ("cleanup").
    if (f === 'active') return list.filter(r =>
      r.status === 'upcoming' || r.status === 'seated'
        || r.status === 'expired' || r.status === 'cleanup'
    );
    return list.filter(r => r.status === f);
  });

  reservationsByTable = computed(() => {
    const map = new Map<number, FloorReservation[]>();
    for (const r of this.allReservationsForDay()) {
      // expired/cleanup: Tisch ist nominell belegt (Cleanup-Phase = noch nicht
      // wirklich frei, weil aufgeräumt wird).
      if (r.tableId && (
            r.status === 'upcoming'
         || r.status === 'seated'
         || r.status === 'expired'
         || r.status === 'cleanup')) {
        const existing = map.get(r.tableId) ?? [];
        existing.push(r);
        map.set(r.tableId, existing);
      }
    }
    return map;
  });

  stats = computed(() => {
    const list = this.allReservationsForDay();
    return {
      total:    list.length,
      upcoming: list.filter(r => r.status === 'upcoming').length,
      seated:   list.filter(r => r.status === 'seated').length,
      expired:  list.filter(r => r.status === 'expired').length,
      cleanup:  list.filter(r => r.status === 'cleanup').length,
      guests:   list
        .filter(r => r.status === 'upcoming' || r.status === 'seated' || r.status === 'expired')
        .reduce((sum, r) => sum + r.partySize, 0),
    };
  });

  // ── Tagesverlauf (kleine Sparkline-Punkte pro Stunde) ─────────────────
  dayLoad = computed<Array<{ hour: number; count: number; isPeak: boolean }>>(() => {
    const buckets = new Map<number, number>();
    for (const r of this.allReservationsForDay()) {
      if (r.status === 'cancelled' || r.status === 'no-show') continue;
      const h = parseInt(r.time.split(':')[0], 10);
      buckets.set(h, (buckets.get(h) ?? 0) + 1);
    }
    const max = Math.max(1, ...buckets.values());
    const result: Array<{ hour: number; count: number; isPeak: boolean }> = [];
    for (let h = 11; h <= 23; h++) {
      const count = buckets.get(h) ?? 0;
      result.push({ hour: h, count, isPeak: count === max && count > 0 });
    }
    return result;
  });

  // ── Gruppierung nach Stunde für die Liste ─────────────────────────────
  timeGroups = computed<Array<{ hour: string; reservations: FloorReservation[] }>>(() => {
    const groups = new Map<string, FloorReservation[]>();
    for (const r of this.filteredReservations()) {
      const hourKey = r.time.split(':')[0] + ':00';
      const list = groups.get(hourKey) ?? [];
      list.push(r);
      groups.set(hourKey, list);
    }
    return Array.from(groups.entries())
      .map(([hour, reservations]) => ({ hour, reservations }))
      .sort((a, b) => a.hour.localeCompare(b.hour));
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
    dt.setDate(dt.getDate() + days);
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
  openNewDialog(preset?: Partial<typeof this.form>) {
    this.form = {
      guestName: '',
      guestEmail: '',
      partySize: 2,
      time: this.nextSlot(),
      durationMinutes: this.timing.defaultDurationMinutes(),
      tableId: 0,
      phone: '',
      notes: '',
      isWalkIn: false,
      ...preset,
    };
    this.formError.set(null);
    this.editingId.set(null);
    this.newDialogOpen.set(true);
    setTimeout(() => {
      (document.querySelector('.reservation-form__name-input') as HTMLInputElement | null)?.focus();
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
  reassignMode = signal<{ reservationId: string; sourceTableId: number } | null>(null);
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
        return;
      }
      this.reservationsService.update(mode.reservationId, { tableId });
      this.reassignMode.set(null);
      return;
    }

    const status = this.tableStatus(tableId);
    if (status.reservation) {
      this.openEditDialog(status.reservation);
      return;
    }
    const t = this.room()?.tables.find(x => x.id === tableId);
    const seats = t?.seats ?? 2;
    this.openNewDialog({ tableId, partySize: Math.min(seats, 4) });
  }

  cancelReassign(): void { this.reassignMode.set(null); }

  /** Klick in den leeren Plan oder Escape → Umplatzierung abbrechen. */
  onCanvasClick(): void { if (this.reassignMode()) this.cancelReassign(); }

  @HostListener('document:keyup.escape')
  onEscape(): void { if (this.reassignMode()) this.cancelReassign(); }

  openEditDialog(res: FloorReservation) {
    this.form = {
      guestName: res.guestName,
      guestEmail: '',
      partySize: res.partySize,
      time: res.time,
      durationMinutes: res.durationMinutes,
      tableId: res.tableId ?? 0,
      phone: res.phone ?? '',
      notes: res.notes ?? '',
      isWalkIn: false,
    };
    this.formError.set(null);
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
    this.guestSuggestions.set([]);
    this.showSuggestions.set(false);
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

    const name = this.form.guestName.trim();
    if (!name) { this.formError.set('Bitte gib einen Namen ein.'); return; }
    if (this.form.partySize < 1) { this.formError.set('Personenanzahl muss mindestens 1 sein.'); return; }
    if (!/^\d{2}:\d{2}$/.test(this.form.time)) { this.formError.set('Bitte eine gültige Uhrzeit eingeben.'); return; }

    const editId  = this.editingId();
    const editing = this.editingReservation();
    if (editId && editing) {
      // Lokalen Floor-State aktualisieren
      this.reservationsService.update(editId, {
        guestName:       name,
        partySize:       this.form.partySize,
        time:            this.form.time,
        durationMinutes: this.form.durationMinutes,
        tableId:         this.form.tableId || undefined,
        phone:           this.form.phone.trim() || undefined,
        notes:           this.form.notes.trim() || undefined,
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
      // Lokalen Floor-State anlegen.
      // Walk-Ins starten direkt mit Status "seated" (Gast sitzt schon),
      // alle anderen Reservierungen mit dem Default ("upcoming").
      const isWalkIn = this.form.isWalkIn;
      const local = this.reservationsService.add({
        roomId:          room.id,
        guestName:       name,
        partySize:       this.form.partySize,
        date:            this.selectedDate(),
        time:            this.form.time,
        durationMinutes: this.form.durationMinutes,
        tableId:         this.form.tableId || undefined,
        phone:           this.form.phone.trim() || undefined,
        notes:           this.form.notes.trim() || undefined,
        status:          isWalkIn ? 'seated' : undefined,
      });

      // Im Backend persistieren und Backend-ID zurückschreiben.
      // Bei Walk-In zusätzlich direkt confirmen, damit der Backend-Status
      // ebenfalls auf "seated/confirmed" springt.
      const startsAt = `${this.selectedDate()}T${this.form.time}:00`;
      this.apiReservations.create({
        venue_id:    room.id,
        guest_name:  name,
        guest_email: this.form.guestEmail.trim() || undefined,
        guest_phone: this.form.phone.trim() || undefined,
        party_size:  this.form.partySize,
        starts_at:   startsAt,
        notes:       this.form.notes.trim() || undefined,
      }).subscribe({
        next: res => {
          this.reservationsService.update(local.id, { backendId: res.id });
          if (isWalkIn) {
            this.apiReservations.confirm(res.id).subscribe({
              error: () => console.warn('Walk-In: Backend-Confirm fehlgeschlagen.'),
            });
          }
        },
        error: () => console.warn('Reservierung lokal gespeichert, Backend-Sync fehlgeschlagen.'),
      });

      this.closeFormDialog();
    }
  }

  // ── Status-Aktionen ───────────────────────────────────────────────────
  checkIn(res: FloorReservation) {
    if (!res.tableId) {
      this.tablePickerFor.set(res.id);
      return;
    }
    this.reservationsService.setStatus(res.id, 'seated');
    if (res.backendId) {
      this.apiReservations.confirm(res.backendId).subscribe({
        error: () => console.warn('Check-in Backend-Sync fehlgeschlagen'),
      });
    }
  }

  assignTableAndCheckIn(tableId: number) {
    const id = this.tablePickerFor();
    if (!id) return;
    this.reservationsService.update(id, { tableId, status: 'seated' });
    this.tablePickerFor.set(null);
    const backendId = this.reservationsService.reservations().find(r => r.id === id)?.backendId;
    if (backendId) {
      this.apiReservations.confirm(backendId).subscribe({
        error: () => console.warn('Check-in Backend-Sync fehlgeschlagen'),
      });
    }
  }

  skipTableAndCheckIn() {
    const id = this.tablePickerFor();
    if (!id) return;
    const res = this.reservationsService.reservations().find(r => r.id === id);
    this.reservationsService.setStatus(id, 'seated');
    this.tablePickerFor.set(null);
    if (res?.backendId) {
      this.apiReservations.confirm(res.backendId).subscribe({
        error: () => console.warn('Check-in Backend-Sync fehlgeschlagen'),
      });
    }
  }

  closeTablePicker() { this.tablePickerFor.set(null); }

  /**
   * Reservierung beenden:
   *   • Cleanup AN  → Status → 'cleanup' (Tisch bleibt visuell belegt,
   *     Heartbeat schaltet ihn nach Ablauf der Cleanup-Zeit auf 'completed').
   *     Der Backend-Complete-Call wird erst beim Cleanup-Ende ausgelöst.
   *   • Cleanup AUS → Status sofort auf 'completed' und Backend syncen.
   */
  markCompleted(res: FloorReservation) {
    if (this.timing.cleanupEnabled()) {
      this.reservationsService.setStatus(res.id, 'cleanup');
      return;
    }
    this.reservationsService.setStatus(res.id, 'completed');
    if (res.backendId) {
      this.apiReservations.complete(res.backendId).subscribe({
        error: () => console.warn('Complete Backend-Sync fehlgeschlagen'),
      });
    }
  }

  /**
   * Cleanup abbrechen / Tisch sofort als frei markieren — auch dann nutzbar,
   * wenn der Service noch in der Cleanup-Phase steht aber der Tisch real
   * schon wieder bereit ist.
   */
  markCleanupDone(res: FloorReservation) {
    this.reservationsService.setStatus(res.id, 'completed');
    if (res.backendId) {
      this.apiReservations.complete(res.backendId).subscribe({
        error: () => console.warn('Complete Backend-Sync fehlgeschlagen'),
      });
    }
  }

  markNoShow(res: FloorReservation) {
    this.reservationsService.setStatus(res.id, 'no-show');
    if (res.backendId) {
      this.apiReservations.markNoShow(res.backendId).subscribe({
        error: () => console.warn('No-Show Backend-Sync fehlgeschlagen'),
      });
    }
  }

  cancel(res: FloorReservation) {
    this.reservationsService.setStatus(res.id, 'cancelled');
    if (res.backendId) {
      this.apiReservations.cancel(res.backendId).subscribe({
        error: () => console.warn('Cancel Backend-Sync fehlgeschlagen'),
      });
    }
  }

  remove(res: FloorReservation) { this.reservationsService.remove(res.id); }

  reopen(res: FloorReservation) {
    this.reservationsService.setStatus(res.id, 'upcoming');
    if (res.backendId) {
      this.apiReservations.reopen(res.backendId).subscribe({
        error: () => console.warn('Reopen Backend-Sync fehlgeschlagen'),
      });
    }
  }

  /**
   * Verlängert eine "Zeit abgelaufen"-Reservierung um 30 Minuten und
   * setzt sie zurück auf "seated". Der Auto-Expire-Heartbeat wird sie
   * dann nach Ablauf der zusätzlichen 30 Minuten erneut auf "expired"
   * setzen.
   */
  extendReservation(res: FloorReservation, addMinutes: number = 30) {
    const newDuration = (res.durationMinutes ?? 0) + addMinutes;
    this.reservationsService.update(res.id, {
      durationMinutes: newDuration,
      status: 'seated',
    });
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
    // Priorität: expired > seated > cleanup > upcoming.
    //   • expired = Standard-Dauer ist überzogen (höchste Aufmerksamkeit nötig).
    //   • seated  = Gäste sitzen am Tisch.
    //   • cleanup = Gäste sind weg, aber der Tisch ist noch nicht frei.
    //   • upcoming = Reservierung steht bevor.
    const expired = list.find(r => r.status === 'expired');
    if (expired) return { status: 'expired', reservation: expired };
    const seated = list.find(r => r.status === 'seated');
    if (seated) return { status: 'seated', reservation: seated };
    const cleanup = list.find(r => r.status === 'cleanup');
    if (cleanup) return { status: 'cleanup', reservation: cleanup };
    const upcoming = list.find(r => r.status === 'upcoming');
    if (upcoming) return { status: 'upcoming', reservation: upcoming };
    return { status: null, reservation: null };
  }

  tableStatusClass(tableId: number): string {
    const s = this.tableStatus(tableId).status;
    if (s === 'expired')  return 'is-expired';
    if (s === 'seated')   return 'is-seated';
    if (s === 'cleanup')  return 'is-cleanup';
    if (s === 'upcoming') return 'is-upcoming';
    return '';
  }

  // Für den Tisch-Picker im Dialog: alle (nicht gemergten Partner)
  availableTables(): PlacedTable[] {
    const r = this.room();
    if (!r) return [];
    return r.tables;
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
