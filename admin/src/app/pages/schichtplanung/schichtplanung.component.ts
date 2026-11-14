import {
  Component, OnInit, computed, inject, signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { StaffService, StaffMember } from '../../services/staff.service';
import { FloorReservationsService } from '../../services/floor-reservations.service';

// ═══════════════════════════════════════════════════════════════════════════
// Typen
// ═══════════════════════════════════════════════════════════════════════════

export type ShiftType = 'early' | 'late' | 'night' | 'off' | 'vacation' | 'sick' | 'custom';
export type AvailType = 'preferred' | 'available' | 'unavailable';
export type SidebarTab = 'templates' | 'settings' | 'requests' | 'availability';

export interface ShiftDef {
  key: ShiftType; label: string; icon: string; color: string;
  defaultStart?: string; defaultEnd?: string;
}

export interface Shift {
  id: string; employeeId: string; date: string;
  type: ShiftType; startTime: string; endTime: string; note: string;
}

/** Verfügbarkeit: pro Mitarbeiter pro Wochentag (0=Mo … 6=So) */
export interface AvailEntry {
  employeeId: string; weekday: number; type: AvailType;
}

/** Schicht-Vorlage (gespeicherte Woche) */
export interface ShiftTemplate {
  id: string; name: string;
  entries: Array<{
    weekday: number; employeeId: string;
    type: ShiftType; startTime: string; endTime: string; note: string;
  }>;
}

/** App-Einstellungen */
export interface SpSettings {
  overtimeLimit: number;   // Stunden/Woche, Default 40
  minStaff: number[];      // [Mo..So], Default alle 0
}

/** Stundenlohn */
export interface WageEntry { employeeId: string; hourlyRate: number; }

/** Tausch-Anfrage */
export interface SwapRequest {
  id: string; fromEmployeeId: string; toEmployeeId: string;
  date: string; status: 'pending' | 'accepted' | 'rejected';
  note: string; createdAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Konstanten
// ═══════════════════════════════════════════════════════════════════════════

export const SHIFT_DEFS: ShiftDef[] = [
  { key: 'early',    label: 'shift.shift_early',    icon: 'wb_sunny',       color: '#f59e0b', defaultStart: '07:00', defaultEnd: '15:00' },
  { key: 'late',     label: 'shift.shift_late',     icon: 'nights_stay',    color: '#6366f1', defaultStart: '15:00', defaultEnd: '23:00' },
  { key: 'night',    label: 'shift.shift_night',    icon: 'dark_mode',      color: '#94a3b8', defaultStart: '23:00', defaultEnd: '07:00' },
  { key: 'off',      label: 'shift.shift_off',      icon: 'weekend',        color: '#22c55e', defaultStart: '',      defaultEnd: ''      },
  { key: 'vacation', label: 'shift.shift_vacation', icon: 'beach_access',   color: '#06b6d4', defaultStart: '',      defaultEnd: ''      },
  { key: 'sick',     label: 'shift.shift_sick',     icon: 'sick',           color: '#ef4444', defaultStart: '',      defaultEnd: ''      },
  { key: 'custom',   label: 'shift.shift_custom',   icon: 'edit_calendar',  color: '#a78bfa', defaultStart: '09:00', defaultEnd: '17:00' },
];
const SHIFT_MAP = Object.fromEntries(SHIFT_DEFS.map(d => [d.key, d])) as Record<ShiftType, ShiftDef>;

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAY_FULL   = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const MONTH_NAMES    = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

const SK_SHIFTS    = 'sp:shifts';
const SK_AVAIL     = 'sp:avail';
const SK_TEMPLATES = 'sp:templates';
const SK_SETTINGS  = 'sp:settings';
const SK_WAGES     = 'sp:wages';
const SK_SWAPS     = 'sp:swaps';

const DEFAULT_SETTINGS: SpSettings = { overtimeLimit: 40, minStaff: [2,2,2,2,2,1,1] };

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function shiftHours(s: Shift): number {
  if (!s.startTime || !s.endTime) return 0;
  let mins = parseMinutes(s.endTime) - parseMinutes(s.startTime);
  if (mins < 0) mins += 1440;
  return mins / 60;
}
function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0,0,0,0);
  return m;
}
function getWeekDays(monday: Date): Date[] {
  return Array.from({length:7}, (_,i) => {
    const d = new Date(monday); d.setDate(monday.getDate()+i); return d;
  });
}
function weekNumber(d: Date): number {
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const w1 = getWeekStart(jan4);
  return Math.floor((d.getTime()-w1.getTime())/(7*86400000))+1;
}
function loadLS<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
  catch { return fallback; }
}
function saveLS(key: string, val: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════
// Komponente
// ═══════════════════════════════════════════════════════════════════════════

@Component({
  selector: 'app-schichtplanung',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './schichtplanung.component.html',
  styleUrl: './schichtplanung.component.scss',
})
export class SchichtplanungComponent implements OnInit {
  private readonly staffService        = inject(StaffService);
  private readonly reservationsService = inject(FloorReservationsService);

  // ── Basis-State ──────────────────────────────────────────────────────────
  readonly employees  = signal<StaffMember[]>([]);
  readonly loading    = signal(true);
  readonly weekStart  = signal<Date>(getWeekStart(new Date()));
  readonly shifts     = signal<Shift[]>(loadLS(SK_SHIFTS, []));
  readonly todayIso   = isoDate(new Date());

  // ── Feature-State ─────────────────────────────────────────────────────────
  readonly availability = signal<AvailEntry[]>(loadLS(SK_AVAIL, []));
  readonly templates    = signal<ShiftTemplate[]>(loadLS(SK_TEMPLATES, []));
  readonly settings     = signal<SpSettings>(loadLS(SK_SETTINGS, DEFAULT_SETTINGS));
  readonly wages        = signal<WageEntry[]>(loadLS(SK_WAGES, []));
  readonly swapRequests = signal<SwapRequest[]>(loadLS(SK_SWAPS, []));

  // ── UI-State ──────────────────────────────────────────────────────────────
  readonly sidebarTab  = signal<SidebarTab>('availability');
  readonly sidebarOpen = signal(true);

  // Schicht-Popup
  readonly popup = signal<{
    employeeId: string; date: string; shift: Shift | null; mode: 'new'|'edit';
    showSwapForm: boolean;
  } | null>(null);
  popupType: ShiftType  = 'early';
  popupStart = ''; popupEnd = ''; popupNote = '';
  swapTargetId  = '';
  swapNote      = '';

  // Vorlage speichern
  templateNameInput = '';
  showTemplateSave  = false;

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly weekDays = computed(() => getWeekDays(this.weekStart()));

  readonly weekLabel = computed(() => {
    const [first, , , , , , last] = this.weekDays();
    const kw = weekNumber(first);
    const y  = first.getFullYear();
    if (first.getMonth() === last.getMonth())
      return `${first.getDate()}. – ${last.getDate()}. ${MONTH_NAMES[first.getMonth()]} ${y}  ·  KW ${kw}`;
    return `${first.getDate()}. ${MONTH_NAMES[first.getMonth()]} – ${last.getDate()}. ${MONTH_NAMES[last.getMonth()]} ${y}  ·  KW ${kw}`;
  });

  readonly activeEmployees = computed(() => this.employees().filter(e => e.active));

  readonly pendingSwaps = computed(() => this.swapRequests().filter(s => s.status === 'pending'));

  readonly totalWeeklyCost = computed(() => {
    const days = this.weekDays();
    return this.activeEmployees().reduce((sum, emp) => sum + this.weeklyWage(emp.id, days), 0);
  });

  // ── Exposed Konstanten ────────────────────────────────────────────────────
  readonly shiftDefs     = SHIFT_DEFS;
  readonly shiftMap      = SHIFT_MAP;
  readonly weekdayLabels = WEEKDAY_LABELS;
  readonly weekdayFull   = WEEKDAY_FULL;
  readonly availTypes: { key: AvailType; label: string; icon: string; color: string }[] = [
    { key: 'preferred',   label: 'shift.avail_preferred',   icon: 'star',         color: '#22c55e' },
    { key: 'available',   label: 'shift.avail_available',   icon: 'check_circle', color: '#94a3b8' },
    { key: 'unavailable', label: 'shift.avail_unavailable', icon: 'cancel',       color: '#ef4444' },
  ];

  // ── Init ──────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.staffService.list().subscribe({
      next: list => {
        this.employees.set(list?.length ? list : this.demoStaff());
        this.loading.set(false);
      },
      error: () => { this.employees.set(this.demoStaff()); this.loading.set(false); },
    });
  }

  private demoStaff(): StaffMember[] {
    return [
      { id: 'demo-1', employee_number: 1, name: 'Max Mustermann', email: null, role: 'admin',   active: true, created_at: '' },
      { id: 'demo-2', employee_number: 2, name: 'Lena Vogel',     email: null, role: 'manager', active: true, created_at: '' },
      { id: 'demo-3', employee_number: 3, name: 'Anna Schmidt',   email: null, role: 'staff',   active: true, created_at: '' },
    ];
  }

  // ── Woche Navigation ──────────────────────────────────────────────────────
  prevWeek(): void { const d = new Date(this.weekStart()); d.setDate(d.getDate()-7); this.weekStart.set(d); }
  nextWeek(): void { const d = new Date(this.weekStart()); d.setDate(d.getDate()+7); this.weekStart.set(d); }
  goToday():  void { this.weekStart.set(getWeekStart(new Date())); }
  isCurrentWeek(): boolean { return isoDate(this.weekStart()) === isoDate(getWeekStart(new Date())); }

  // ── Schichten ─────────────────────────────────────────────────────────────
  getShift(employeeId: string, date: string): Shift | null {
    return this.shifts().find(s => s.employeeId === employeeId && s.date === date) ?? null;
  }

  hoursForEmployee(employeeId: string): number {
    const days = this.weekDays();
    return this.shifts()
      .filter(s => s.employeeId === employeeId && days.some(d => isoDate(d) === s.date))
      .reduce((sum, s) => sum + shiftHours(s), 0);
  }

  hoursForDay(date: string): number {
    return this.shifts().filter(s => s.date === date).reduce((sum, s) => sum + shiftHours(s), 0);
  }

  staffCountForDay(date: string): number {
    return this.shifts().filter(s => s.date === date && s.type !== 'off' && s.type !== 'vacation' && s.type !== 'sick').length;
  }

  isUnderstaffed(date: Date, index: number): boolean {
    const min = this.settings().minStaff[index] ?? 0;
    return min > 0 && this.staffCountForDay(isoDate(date)) < min;
  }

  isOvertime(employeeId: string): boolean {
    return this.hoursForEmployee(employeeId) > this.settings().overtimeLimit;
  }

  // ── Lohnkosten ────────────────────────────────────────────────────────────
  getWage(employeeId: string): number {
    return this.wages().find(w => w.employeeId === employeeId)?.hourlyRate ?? 0;
  }

  setWage(employeeId: string, rate: number): void {
    this.wages.update(list => {
      const without = list.filter(w => w.employeeId !== employeeId);
      return rate > 0 ? [...without, { employeeId, hourlyRate: rate }] : without;
    });
    saveLS(SK_WAGES, this.wages());
  }

  weeklyWage(employeeId: string, days: Date[]): number {
    const rate  = this.getWage(employeeId);
    const hours = this.shifts()
      .filter(s => s.employeeId === employeeId && days.some(d => isoDate(d) === s.date))
      .reduce((sum, s) => sum + shiftHours(s), 0);
    return rate * hours;
  }

  formatCost(n: number): string {
    if (n === 0) return '–';
    return n.toLocaleString('de-DE', { style:'currency', currency:'EUR', maximumFractionDigits: 0 });
  }

  // ── Reservierungen ────────────────────────────────────────────────────────
  reservationsForDay(date: string): number {
    return this.reservationsService.reservations().filter(r => r.date === date).length;
  }

  // ── Verfügbarkeit ─────────────────────────────────────────────────────────
  getAvailability(employeeId: string, weekday: number): AvailType | null {
    return this.availability().find(a => a.employeeId === employeeId && a.weekday === weekday)?.type ?? null;
  }

  setAvailability(employeeId: string, weekday: number, type: AvailType | null): void {
    this.availability.update(list => {
      const without = list.filter(a => !(a.employeeId === employeeId && a.weekday === weekday));
      return type ? [...without, { employeeId, weekday, type }] : without;
    });
    saveLS(SK_AVAIL, this.availability());
  }

  cycleAvailability(employeeId: string, weekday: number): void {
    const cur = this.getAvailability(employeeId, weekday);
    const next: Record<string, AvailType | null> = { 'null': 'preferred', 'preferred': 'available', 'available': 'unavailable', 'unavailable': null };
    this.setAvailability(employeeId, weekday, next[String(cur)] as AvailType | null);
  }

  availIcon(type: AvailType | null): string {
    const map: Record<string, string> = { preferred: 'star', available: 'check_circle', unavailable: 'cancel' };
    return type ? (map[type] ?? '') : '';
  }
  availColor(type: AvailType | null): string {
    const map: Record<string, string> = { preferred: '#22c55e', available: '#94a3b8', unavailable: '#ef4444' };
    return type ? (map[type] ?? 'transparent') : 'transparent';
  }

  // ── Einstellungen ─────────────────────────────────────────────────────────
  getMinStaff(weekday: number): number { return this.settings().minStaff[weekday] ?? 0; }

  setMinStaff(weekday: number, val: number): void {
    this.settings.update(s => {
      const ms = [...s.minStaff];
      ms[weekday] = Math.max(0, val);
      return { ...s, minStaff: ms };
    });
    saveLS(SK_SETTINGS, this.settings());
  }

  setOvertimeLimit(val: number): void {
    this.settings.update(s => ({ ...s, overtimeLimit: Math.max(1, val) }));
    saveLS(SK_SETTINGS, this.settings());
  }

  // ── Vorlagen ──────────────────────────────────────────────────────────────
  saveTemplate(): void {
    const name = this.templateNameInput.trim();
    if (!name) return;
    const days = this.weekDays();
    const entries = this.shifts()
      .filter(s => days.some(d => isoDate(d) === s.date))
      .map(s => {
        const d = new Date(s.date + 'T00:00:00');
        const wd = d.getDay() === 0 ? 6 : d.getDay() - 1;
        return { weekday: wd, employeeId: s.employeeId, type: s.type, startTime: s.startTime, endTime: s.endTime, note: s.note };
      });
    const tpl: ShiftTemplate = { id: crypto.randomUUID(), name, entries };
    this.templates.update(list => [...list, tpl]);
    saveLS(SK_TEMPLATES, this.templates());
    this.templateNameInput = '';
    this.showTemplateSave  = false;
  }

  applyTemplate(tpl: ShiftTemplate): void {
    const days = this.weekDays();
    const newShifts: Shift[] = tpl.entries
      .filter(e => !this.getShift(e.employeeId, isoDate(days[e.weekday])))
      .map(e => ({
        id: crypto.randomUUID(), employeeId: e.employeeId,
        date: isoDate(days[e.weekday]), type: e.type,
        startTime: e.startTime, endTime: e.endTime, note: e.note,
      }));
    this.shifts.update(list => [...list, ...newShifts]);
    saveLS(SK_SHIFTS, this.shifts());
  }

  deleteTemplate(id: string): void {
    this.templates.update(list => list.filter(t => t.id !== id));
    saveLS(SK_TEMPLATES, this.templates());
  }

  copyLastWeek(): void {
    const days     = this.weekDays();
    const newShifts: Shift[] = [];
    for (let i = 0; i < 7; i++) {
      const lastDate = (() => { const d = new Date(days[i]); d.setDate(d.getDate()-7); return isoDate(d); })();
      const thisDate = isoDate(days[i]);
      for (const s of this.shifts().filter(s => s.date === lastDate)) {
        if (!this.getShift(s.employeeId, thisDate))
          newShifts.push({ ...s, id: crypto.randomUUID(), date: thisDate });
      }
    }
    this.shifts.update(list => [...list, ...newShifts]);
    saveLS(SK_SHIFTS, this.shifts());
  }

  // ── Tausch-Anfragen ───────────────────────────────────────────────────────
  openSwapForm(): void {
    this.swapTargetId = '';
    this.swapNote     = '';
    this.popup.update(p => p ? { ...p, showSwapForm: true } : null);
  }

  submitSwap(): void {
    const p = this.popup();
    if (!p || !this.swapTargetId) return;
    const req: SwapRequest = {
      id: crypto.randomUUID(), fromEmployeeId: p.employeeId,
      toEmployeeId: this.swapTargetId, date: p.date,
      status: 'pending', note: this.swapNote, createdAt: Date.now(),
    };
    this.swapRequests.update(list => [...list, req]);
    saveLS(SK_SWAPS, this.swapRequests());
    this.popup.update(p => p ? { ...p, showSwapForm: false } : null);
  }

  resolveSwap(id: string, accept: boolean): void {
    const req = this.swapRequests().find(s => s.id === id);
    if (req && accept) {
      // Schichten tauschen
      const shiftA = this.getShift(req.fromEmployeeId, req.date);
      const shiftB = this.getShift(req.toEmployeeId,   req.date);
      if (shiftA && shiftB) {
        this.shifts.update(list => list.map(s => {
          if (s.id === shiftA.id) return { ...s, employeeId: req.toEmployeeId };
          if (s.id === shiftB.id) return { ...s, employeeId: req.fromEmployeeId };
          return s;
        }));
      } else if (shiftA && !shiftB) {
        this.shifts.update(list => list.map(s =>
          s.id === shiftA.id ? { ...s, employeeId: req.toEmployeeId } : s
        ));
      }
      saveLS(SK_SHIFTS, this.shifts());
    }
    this.swapRequests.update(list => list.map(s =>
      s.id === id ? { ...s, status: accept ? 'accepted' : 'rejected' } : s
    ));
    saveLS(SK_SWAPS, this.swapRequests());
  }

  deleteSwap(id: string): void {
    this.swapRequests.update(list => list.filter(s => s.id !== id));
    saveLS(SK_SWAPS, this.swapRequests());
  }

  // ── Popup ─────────────────────────────────────────────────────────────────
  openCell(employeeId: string, date: Date): void {
    const dateIso  = isoDate(date);
    const existing = this.getShift(employeeId, dateIso);
    if (existing) {
      this.popupType  = existing.type; this.popupStart = existing.startTime;
      this.popupEnd   = existing.endTime; this.popupNote = existing.note;
      this.popup.set({ employeeId, date: dateIso, shift: existing, mode: 'edit', showSwapForm: false });
    } else {
      const def = SHIFT_DEFS[0];
      this.popupType  = def.key; this.popupStart = def.defaultStart ?? '';
      this.popupEnd   = def.defaultEnd ?? ''; this.popupNote = '';
      this.popup.set({ employeeId, date: dateIso, shift: null, mode: 'new', showSwapForm: false });
    }
  }

  selectPopupType(type: ShiftType): void {
    this.popupType = type;
    const def = SHIFT_MAP[type];
    if (def.defaultStart !== undefined) this.popupStart = def.defaultStart;
    if (def.defaultEnd   !== undefined) this.popupEnd   = def.defaultEnd;
  }

  savePopup(): void {
    const p = this.popup();
    if (!p) return;
    const shift: Shift = {
      id: p.shift?.id ?? crypto.randomUUID(), employeeId: p.employeeId,
      date: p.date, type: this.popupType,
      startTime: this.popupStart, endTime: this.popupEnd, note: this.popupNote,
    };
    this.shifts.update(list => {
      const without = list.filter(s => !(s.employeeId === shift.employeeId && s.date === shift.date));
      return [...without, shift];
    });
    saveLS(SK_SHIFTS, this.shifts());
    this.popup.set(null);
  }

  deleteShift(): void {
    const p = this.popup();
    if (!p?.shift) return;
    this.shifts.update(list => list.filter(s => !(s.employeeId === p.employeeId && s.date === p.date)));
    saveLS(SK_SHIFTS, this.shifts());
    this.popup.set(null);
  }

  closePopup(): void { this.popup.set(null); }
  closeSwapForm(): void { this.popup.update(p => p ? { ...p, showSwapForm: false } : null); }

  popupEmployee(): StaffMember | null {
    const p = this.popup();
    return p ? (this.employees().find(e => e.id === p.employeeId) ?? null) : null;
  }

  popupDateLabel(): string {
    const p = this.popup();
    if (!p) return '';
    const d = new Date(p.date + 'T00:00:00');
    return `${WEEKDAY_FULL[d.getDay() === 0 ? 6 : d.getDay()-1]}, ${d.getDate()}. ${MONTH_NAMES[d.getMonth()]}`;
  }

  otherEmployees(): StaffMember[] {
    const p = this.popup();
    return p ? this.activeEmployees().filter(e => e.id !== p.employeeId) : [];
  }

  swapTargetName(): string {
    return this.employees().find(e => e.id === this.swapTargetId)?.name ?? '';
  }

  swapFromName(req: SwapRequest): string  { return this.employees().find(e => e.id === req.fromEmployeeId)?.name ?? '?'; }
  swapToName(req: SwapRequest): string    { return this.employees().find(e => e.id === req.toEmployeeId)?.name   ?? '?'; }
  swapDateLabel(req: SwapRequest): string {
    const d = new Date(req.date + 'T00:00:00');
    return `${d.getDate()}. ${MONTH_NAMES[d.getMonth()]}`;
  }

  // ── PDF-Export ────────────────────────────────────────────────────────────
  printPlan(): void { window.print(); }

  // ── Helpers ───────────────────────────────────────────────────────────────
  isToday(date: Date): boolean { return isoDate(date) === this.todayIso; }
  isPast(date: Date):  boolean { return isoDate(date) <  this.todayIso; }
  toIso(date: Date):   string  { return isoDate(date); }

  initials(name: string): string {
    const p = name.trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return p.length === 1 ? p[0].slice(0,2).toUpperCase() : (p[0][0]+p[p.length-1][0]).toUpperCase();
  }

  roleLabel(role: string): string {
    return ({ admin:'Admin', manager:'Manager', staff:'Staff' })[role] ?? role;
  }

  formatHours(h: number): string {
    if (h === 0) return '–';
    const full = Math.floor(h);
    const mins = Math.round((h-full)*60);
    return mins > 0 ? `${full}h ${mins}m` : `${full}h`;
  }

  readonly resolvedSwaps = computed(() => this.swapRequests().filter(s => s.status !== 'pending'));

  trackById(_: number, item: { id: string }): string { return item.id; }
}