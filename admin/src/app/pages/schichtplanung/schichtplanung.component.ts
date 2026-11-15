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
import { SchichtplanungService } from '../../services/schichtplanung.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ═══════════════════════════════════════════════════════════════════════════
// Typen
// ═══════════════════════════════════════════════════════════════════════════

export type ShiftType = string; // built-in: 'early'|'late'|'night'|'off'|'vacation'|'sick'|'custom' + user-defined UUIDs
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

/** Vom Nutzer selbst angelegte Schicht */
export interface UserShift {
  id: string;
  name: string;
  color: string;
  icon: string;
  start: string;
  end: string;
}

/** Konfigurierbare Schichtzeiten */
export interface ShiftTimes {
  early: { start: string; end: string };
  late:  { start: string; end: string };
  night: { start: string; end: string };
}

/** App-Einstellungen */
export interface SpSettings {
  overtimeLimit: number;   // Stunden/Woche, Default 40
  minStaff: number[];      // [Mo..So], Default alle 0
  shiftTimes?: ShiftTimes;   // konfigurierbare Zeiten für built-in Schichten
  userShifts?: UserShift[];  // selbst angelegte Schichten
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

const DEFAULT_SHIFT_TIMES: ShiftTimes = {
  early: { start: '07:00', end: '15:00' },
  late:  { start: '15:00', end: '23:00' },
  night: { start: '23:00', end: '07:00' },
};

const DEFAULT_SETTINGS: SpSettings = {
  overtimeLimit: 40,
  minStaff: [2,2,2,2,2,1,1],
  shiftTimes: DEFAULT_SHIFT_TIMES,
};

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
  private readonly spService           = inject(SchichtplanungService);

  // ── Basis-State ──────────────────────────────────────────────────────────
  readonly employees  = signal<StaffMember[]>([]);
  readonly loading    = signal(true);
  readonly weekStart  = signal<Date>(getWeekStart(new Date()));
  readonly shifts     = signal<Shift[]>([]);
  readonly todayIso          = isoDate(new Date());
  readonly todayWeekStartIso = isoDate(getWeekStart(new Date()));

  // ── Feature-State ─────────────────────────────────────────────────────────
  readonly availability = signal<AvailEntry[]>([]);
  readonly templates    = signal<ShiftTemplate[]>([]);
  readonly settings     = signal<SpSettings>(DEFAULT_SETTINGS);
  readonly wages        = signal<WageEntry[]>([]);
  readonly swapRequests = signal<SwapRequest[]>([]);

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

  readonly kwLabel   = computed(() => `KW ${weekNumber(this.weekStart())}`);

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
  /** Schicht-Definitionen: built-in (mit konfigurierbaren Zeiten) + eigene Schichten */
  readonly shiftDefs = computed<ShiftDef[]>(() => {
    const t = this.settings().shiftTimes ?? DEFAULT_SHIFT_TIMES;
    const builtIn = SHIFT_DEFS.map(def => {
      if (def.key === 'early') return { ...def, defaultStart: t.early.start, defaultEnd: t.early.end };
      if (def.key === 'late')  return { ...def, defaultStart: t.late.start,  defaultEnd: t.late.end  };
      if (def.key === 'night') return { ...def, defaultStart: t.night.start, defaultEnd: t.night.end };
      return def;
    });
    const userDefs: ShiftDef[] = (this.settings().userShifts ?? []).map(us => ({
      key: us.id, label: us.name, icon: us.icon, color: us.color,
      defaultStart: us.start, defaultEnd: us.end,
    }));
    // Reihenfolge: built-in Arbeitschichten → eigene → Abwesenheiten
    const workKeys   = ['early','late','night','custom'];
    const absenceKeys = ['off','vacation','sick'];
    return [
      ...builtIn.filter(d => workKeys.includes(d.key)),
      ...userDefs,
      ...builtIn.filter(d => absenceKeys.includes(d.key)),
    ];
  });

  /** Lookup-Map: ShiftType → ShiftDef (reaktiv, kennt auch eigene Schichten) */
  readonly shiftMap = computed(() =>
    Object.fromEntries(this.shiftDefs().map(d => [d.key, d])) as Record<string, ShiftDef>
  );
  readonly weekdayLabels = WEEKDAY_LABELS;
  readonly weekdayFull   = WEEKDAY_FULL;
  readonly availTypes: { key: AvailType; label: string; icon: string; color: string }[] = [
    { key: 'preferred',   label: 'shift.avail_preferred',   icon: 'star',         color: '#22c55e' },
    { key: 'available',   label: 'shift.avail_available',   icon: 'check_circle', color: '#94a3b8' },
    { key: 'unavailable', label: 'shift.avail_unavailable', icon: 'cancel',       color: '#ef4444' },
  ];

  // ── Optionen für eigene Schichten ─────────────────────────────────────────
  readonly shiftIconOptions = [
    'wb_sunny','nights_stay','dark_mode','restaurant','local_cafe',
    'local_bar','delivery_dining','clean_hands','manage_accounts','work',
    'coffee','bakery_dining','fastfood','room_service','edit_calendar',
    'directions_car','construction','star','spa','fitness_center',
  ];
  readonly shiftColorOptions = [
    '#f59e0b','#6366f1','#94a3b8','#22c55e','#ef4444',
    '#06b6d4','#a78bfa','#f97316','#ec4899','#14b8a6',
    '#2979ff','#ff6d00','#8b5cf6','#10b981','#dc2626',
  ];

  // ── Editor-State für eigene Schichten ─────────────────────────────────────
  showNewShiftForm = false;
  newShift: Partial<UserShift> = {};

  // ── Init ──────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    const y    = this.weekStart().getFullYear();
    const from = `${y - 1}-01-01`;
    const to   = `${y + 1}-12-31`;

    forkJoin({
      staff:        this.staffService.list().pipe(catchError(() => of([] as StaffMember[]))),
      shifts:       this.spService.loadShifts(from, to).pipe(catchError(() => of([] as Shift[]))),
      availability: this.spService.loadAvailability().pipe(catchError(() => of([] as AvailEntry[]))),
      templates:    this.spService.loadTemplates().pipe(catchError(() => of([] as ShiftTemplate[]))),
      settings:     this.spService.loadSettings().pipe(catchError(() => of(DEFAULT_SETTINGS as SpSettings))),
      wages:        this.spService.loadWages().pipe(catchError(() => of([] as WageEntry[]))),
      swaps:        this.spService.loadSwaps().pipe(catchError(() => of([] as SwapRequest[]))),
    }).subscribe(({ staff, shifts, availability, templates, settings, wages, swaps }) => {
      this.employees.set(staff.length ? staff : this.demoStaff());
      this.shifts.set(shifts);
      this.availability.set(availability);
      this.templates.set(templates);
      this.settings.set(settings);
      this.wages.set(wages);
      this.swapRequests.set(swaps);
      this.loading.set(false);
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
    this.spService.setWage(employeeId, rate).subscribe();
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
    if (type) {
      this.spService.upsertAvailability(employeeId, weekday, type).subscribe();
    } else {
      this.spService.deleteAvailability(employeeId, weekday).subscribe();
    }
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
    this.spService.saveSettings(this.settings()).subscribe();
  }

  setOvertimeLimit(val: number): void {
    this.settings.update(s => ({ ...s, overtimeLimit: Math.max(1, val) }));
    this.spService.saveSettings(this.settings()).subscribe();
  }

  setShiftTime(key: 'early' | 'late' | 'night', field: 'start' | 'end', val: string): void {
    this.settings.update(s => {
      const times = { ...(s.shiftTimes ?? DEFAULT_SHIFT_TIMES) };
      times[key] = { ...times[key], [field]: val };
      return { ...s, shiftTimes: times };
    });
    this.spService.saveSettings(this.settings()).subscribe();
  }

  openNewShiftForm(): void {
    this.newShift = { icon: 'wb_sunny', color: '#f59e0b', start: '08:00', end: '16:00', name: '' };
    this.showNewShiftForm = true;
  }

  saveNewShift(): void {
    const s = this.newShift;
    if (!s.name?.trim() || !s.color || !s.icon || !s.start || !s.end) return;
    const entry: UserShift = {
      id: crypto.randomUUID(), name: s.name.trim(),
      color: s.color, icon: s.icon, start: s.start, end: s.end,
    };
    this.settings.update(st => ({ ...st, userShifts: [...(st.userShifts ?? []), entry] }));
    this.spService.saveSettings(this.settings()).subscribe();
    this.showNewShiftForm = false;
    this.newShift = {};
  }

  deleteUserShift(id: string): void {
    this.settings.update(st => ({ ...st, userShifts: (st.userShifts ?? []).filter(s => s.id !== id) }));
    this.spService.saveSettings(this.settings()).subscribe();
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
    this.spService.createTemplate(name, entries).subscribe({
      next: tpl => {
        this.templates.update(list => [...list, tpl]);
        this.templateNameInput = '';
        this.showTemplateSave  = false;
      },
    });
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
    if (!newShifts.length) return;
    this.shifts.update(list => [...list, ...newShifts]);
    this.spService.bulkUpsertShifts(newShifts).subscribe({
      next: saved => this.shifts.update(list => {
        const tempIds = new Set(newShifts.map(s => s.id));
        return [...list.filter(s => !tempIds.has(s.id)), ...saved];
      }),
    });
  }

  deleteTemplate(id: string): void {
    this.templates.update(list => list.filter(t => t.id !== id));
    this.spService.deleteTemplate(id).subscribe();
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
    if (!newShifts.length) return;
    this.shifts.update(list => [...list, ...newShifts]);
    this.spService.bulkUpsertShifts(newShifts).subscribe({
      next: saved => this.shifts.update(list => {
        const tempIds = new Set(newShifts.map(s => s.id));
        return [...list.filter(s => !tempIds.has(s.id)), ...saved];
      }),
    });
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
    const optimistic: SwapRequest = {
      id: crypto.randomUUID(), fromEmployeeId: p.employeeId,
      toEmployeeId: this.swapTargetId, date: p.date,
      status: 'pending', note: this.swapNote, createdAt: Date.now(),
    };
    this.swapRequests.update(list => [...list, optimistic]);
    this.spService.createSwap({
      fromEmployeeId: p.employeeId, toEmployeeId: this.swapTargetId,
      date: p.date, status: 'pending', note: this.swapNote,
    }).subscribe({
      next: saved => this.swapRequests.update(list =>
        list.map(s => s.id === optimistic.id ? saved : s)
      ),
    });
    this.popup.update(p => p ? { ...p, showSwapForm: false } : null);
  }

  resolveSwap(id: string, accept: boolean): void {
    const req = this.swapRequests().find(s => s.id === id);
    if (req && accept) {
      const shiftA = this.getShift(req.fromEmployeeId, req.date);
      const shiftB = this.getShift(req.toEmployeeId,   req.date);
      if (shiftA && shiftB) {
        this.shifts.update(list => list.map(s => {
          if (s.id === shiftA.id) return { ...s, employeeId: req.toEmployeeId };
          if (s.id === shiftB.id) return { ...s, employeeId: req.fromEmployeeId };
          return s;
        }));
        this.spService.reassignShift(shiftA.id, req.toEmployeeId).subscribe();
        this.spService.reassignShift(shiftB.id, req.fromEmployeeId).subscribe();
      } else if (shiftA && !shiftB) {
        this.shifts.update(list => list.map(s =>
          s.id === shiftA.id ? { ...s, employeeId: req.toEmployeeId } : s
        ));
        this.spService.reassignShift(shiftA.id, req.toEmployeeId).subscribe();
      }
    }
    this.swapRequests.update(list => list.map(s =>
      s.id === id ? { ...s, status: accept ? 'accepted' : 'rejected' } : s
    ));
    this.spService.updateSwapStatus(id, accept ? 'accepted' : 'rejected').subscribe();
  }

  deleteSwap(id: string): void {
    this.swapRequests.update(list => list.filter(s => s.id !== id));
    this.spService.deleteSwap(id).subscribe();
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
      const def = this.shiftDefs()[0];
      this.popupType  = def.key; this.popupStart = def.defaultStart ?? '';
      this.popupEnd   = def.defaultEnd ?? ''; this.popupNote = '';
      this.popup.set({ employeeId, date: dateIso, shift: null, mode: 'new', showSwapForm: false });
    }
  }

  selectPopupType(type: ShiftType): void {
    this.popupType = type;
    const def = this.shiftDefs().find(d => d.key === type);
    if (def?.defaultStart !== undefined) this.popupStart = def.defaultStart;
    if (def?.defaultEnd   !== undefined) this.popupEnd   = def.defaultEnd;
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
    this.spService.upsertShift(shift).subscribe({
      next: saved => this.shifts.update(list =>
        list.map(s => s.employeeId === saved.employeeId && s.date === saved.date ? saved : s)
      ),
    });
    this.popup.set(null);
  }

  deleteShift(): void {
    const p = this.popup();
    if (!p?.shift) return;
    const shiftId = p.shift.id;
    this.shifts.update(list => list.filter(s => s.id !== shiftId));
    this.spService.deleteShift(shiftId).subscribe();
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
  downloadPdf(): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const days = this.weekDays();
    const employees = this.activeEmployees();

    doc.setFontSize(16);
    doc.setTextColor(30, 30, 30);
    doc.text('Schichtplan', 14, 16);

    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `${this.weekLabel()}  ·  erstellt am ${new Date().toLocaleDateString('de-DE')}`,
      14, 23,
    );

    const head = [['Mitarbeiter', ...days.map((d, i) => `${WEEKDAY_LABELS[i]}\n${d.getDate()}.${d.getMonth()+1}.`)]];
    const body = employees.map(emp => {
      const cells: string[] = [emp.name];
      for (const day of days) {
        const shift = this.getShift(emp.id, isoDate(day));
        if (!shift) { cells.push('–'); continue; }
        const def = SHIFT_MAP[shift.type];
        const label = def?.label ? shift.type.charAt(0).toUpperCase() + shift.type.slice(1) : shift.type;
        const time = shift.startTime && shift.endTime ? `\n${shift.startTime}–${shift.endTime}` : '';
        cells.push(`${label}${time}`);
      }
      return cells;
    });

    autoTable(doc, {
      startY: 28,
      head,
      body,
      styles:     { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [243, 244, 246], textColor: [50, 50, 50], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 } },
    });

    const kw = weekNumber(days[0]);
    const y  = days[0].getFullYear();
    doc.save(`Schichtplan_KW${kw}_${y}.pdf`);
  }

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
