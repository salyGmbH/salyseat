import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule, MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { RoomsService } from '../../services/rooms.service';
import { ReservationsService } from '../../services/reservations.service';
import { PlacedTable, TableType } from '../../services/room.types';
import { Reservation, ReservationStatus, STATUS_LABELS } from '../../services/reservation.types';

type StatusFilter = 'all' | 'active' | ReservationStatus;

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
  ],
  templateUrl: './raum-detail.component.html',
  styleUrl: './raum-detail.component.scss'
})
export class RaumDetailComponent {
  private readonly roomsService        = inject(RoomsService);
  private readonly reservationsService = inject(ReservationsService);
  private readonly route               = inject(ActivatedRoute);
  private readonly router              = inject(Router);

  readonly STATUS_LABELS = STATUS_LABELS;

  private readonly paramMap = toSignal(this.route.paramMap);

  room = computed(() => {
    const id = this.paramMap()?.get('id');
    return id ? this.roomsService.getRoom(id) : undefined;
  });

  // ── Reservierungs-State ────────────────────────────────────────────────
  selectedDate   = signal<string>(this.todayIso());
  statusFilter   = signal<StatusFilter>('active');

  // Dialoge
  newDialogOpen    = signal(false);
  editDialogOpen   = signal(false);
  tablePickerFor   = signal<string | null>(null); // reservationId, für den Tisch-Auswahl-Dialog
  editingId        = signal<string | null>(null);
  formError        = signal<string | null>(null);

  // Formular für neue/bearbeitete Reservierung
  form = {
    guestName: '',
    partySize: 2,
    time: '19:00',
    durationMinutes: 90,
    tableId: 0 as number | 0, // 0 = kein Tisch
    phone: '',
    notes: '',
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
    if (f === 'active') return list.filter(r => r.status === 'upcoming' || r.status === 'seated');
    return list.filter(r => r.status === f);
  });

  reservationsByTable = computed(() => {
    const map = new Map<number, Reservation[]>();
    for (const r of this.allReservationsForDay()) {
      if (r.tableId && (r.status === 'upcoming' || r.status === 'seated')) {
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
      total:   list.length,
      upcoming: list.filter(r => r.status === 'upcoming').length,
      seated:   list.filter(r => r.status === 'seated').length,
      guests:   list
        .filter(r => r.status === 'upcoming' || r.status === 'seated')
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
  timeGroups = computed<Array<{ hour: string; reservations: Reservation[] }>>(() => {
    const groups = new Map<string, Reservation[]>();
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
      partySize: 2,
      time: this.nextSlot(),
      durationMinutes: 90,
      tableId: 0,
      phone: '',
      notes: '',
      ...preset,
    };
    this.formError.set(null);
    this.editingId.set(null);
    this.newDialogOpen.set(true);
    setTimeout(() => {
      (document.querySelector('.reservation-form__name-input') as HTMLInputElement | null)?.focus();
    }, 0);
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

  openEditDialog(res: Reservation) {
    this.form = {
      guestName: res.guestName,
      partySize: res.partySize,
      time: res.time,
      durationMinutes: res.durationMinutes,
      tableId: res.tableId ?? 0,
      phone: res.phone ?? '',
      notes: res.notes ?? '',
    };
    this.formError.set(null);
    this.editingId.set(res.id);
    this.editDialogOpen.set(true);
  }

  closeFormDialog() {
    this.newDialogOpen.set(false);
    this.editDialogOpen.set(false);
    this.editingId.set(null);
    this.formError.set(null);
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

    const editId = this.editingId();
    if (editId) {
      this.reservationsService.update(editId, {
        guestName:       name,
        partySize:       this.form.partySize,
        time:            this.form.time,
        durationMinutes: this.form.durationMinutes,
        tableId:         this.form.tableId || undefined,
        phone:           this.form.phone.trim() || undefined,
        notes:           this.form.notes.trim() || undefined,
      });
    } else {
      this.reservationsService.add({
        roomId:          room.id,
        guestName:       name,
        partySize:       this.form.partySize,
        date:            this.selectedDate(),
        time:            this.form.time,
        durationMinutes: this.form.durationMinutes,
        tableId:         this.form.tableId || undefined,
        phone:           this.form.phone.trim() || undefined,
        notes:           this.form.notes.trim() || undefined,
      });
    }
    this.closeFormDialog();
  }

  // ── Status-Aktionen ───────────────────────────────────────────────────
  checkIn(res: Reservation) {
    // Wenn kein Tisch zugewiesen, Tisch-Auswahl anstoßen
    if (!res.tableId) {
      this.tablePickerFor.set(res.id);
      return;
    }
    this.reservationsService.setStatus(res.id, 'seated');
  }

  assignTableAndCheckIn(tableId: number) {
    const id = this.tablePickerFor();
    if (!id) return;
    this.reservationsService.update(id, { tableId, status: 'seated' });
    this.tablePickerFor.set(null);
  }

  skipTableAndCheckIn() {
    const id = this.tablePickerFor();
    if (!id) return;
    this.reservationsService.setStatus(id, 'seated');
    this.tablePickerFor.set(null);
  }

  closeTablePicker() { this.tablePickerFor.set(null); }

  markCompleted(res: Reservation) { this.reservationsService.setStatus(res.id, 'completed'); }
  markNoShow(res: Reservation)    { this.reservationsService.setStatus(res.id, 'no-show'); }
  cancel(res: Reservation)        { this.reservationsService.setStatus(res.id, 'cancelled'); }
  remove(res: Reservation)        { this.reservationsService.remove(res.id); }

  reopen(res: Reservation) {
    // Von completed/cancelled/no-show zurück zu upcoming
    this.reservationsService.setStatus(res.id, 'upcoming');
  }

  // ── Rendering-Helfer (aus restaurant-plan übernommen) ─────────────────

  getTableSize(type: TableType): { w: number; h: number } {
    return type === 'long' ? { w: 140, h: 70 } : { w: 70, h: 70 };
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
  tableStatus(tableId: number): { status: ReservationStatus | null; reservation: Reservation | null } {
    const list = this.reservationsByTable().get(tableId) ?? [];
    // eingecheckt hat Vorrang
    const seated = list.find(r => r.status === 'seated');
    if (seated) return { status: 'seated', reservation: seated };
    const upcoming = list.find(r => r.status === 'upcoming');
    if (upcoming) return { status: 'upcoming', reservation: upcoming };
    return { status: null, reservation: null };
  }

  tableStatusClass(tableId: number): string {
    const s = this.tableStatus(tableId).status;
    if (s === 'seated')   return 'is-seated';
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
  statusLabel(status: ReservationStatus): string { return STATUS_LABELS[status]; }
}
