import {
  Component, inject, signal, computed, OnInit, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import {
  NotizenService, Notiz, CreateNotizDto, NotizCreatedBy
} from '../../../services/notizen.service';
import { NotizenStateService } from '../../../services/notizen-state.service';

type ColorKey = Notiz['color'];

interface FormState {
  date: string;
  time: string;
  allDay: boolean;
  title: string;
  text: string;
  color: ColorKey;
}

const COLOR_LABELS: Record<ColorKey, string> = {
  default: 'Standard',
  info:    'Info',
  success: 'Positiv',
  warn:    'Warnung',
};

const MONTHS = [
  'Januar','Februar','März','April','Mai','Juni',
  'Juli','August','September','Oktober','November','Dezember'
];
const WEEKDAYS_SHORT = ['Mo','Di','Mi','Do','Fr','Sa','So'];

@Component({
  selector: 'app-notizen',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, TranslateModule],
  templateUrl: './notizen.component.html',
  styleUrl:    './notizen.component.scss',
})
export class NotizenComponent implements OnInit {
  private readonly svc = inject(NotizenService);
  private readonly notizenState = inject(NotizenStateService);

  // ── Daten ──────────────────────────────────────────────────────────────────
  notizen   = signal<Notiz[]>([]);
  loading   = signal(false);
  saving    = signal(false);
  saved     = signal(false);

  // ── Haupt-Kalender (linke Spalte) ─────────────────────────────────────────
  calYear   = signal(new Date().getFullYear());
  calMonth  = signal(new Date().getMonth());   // 0-based
  selected  = signal<string>(new Date().toISOString().slice(0, 10));  // "YYYY-MM-DD"

  // ── Date-Picker (Formular-Dropdown) ───────────────────────────────────────
  dpOpen    = signal(false);
  dpYear    = signal(new Date().getFullYear());
  dpMonth   = signal(new Date().getMonth());

  // ── Formular ───────────────────────────────────────────────────────────────
  showForm  = signal(false);
  editId    = signal<string | null>(null);
  form: FormState = this.emptyForm();

  // ── Detail-Ansicht ────────────────────────────────────────────────────────
  viewNotiz = signal<Notiz | null>(null);

  colorLabels = COLOR_LABELS;
  colorKeys: ColorKey[] = ['default', 'info', 'success', 'warn'];
  weekdaysShort = WEEKDAYS_SHORT;

  // ── Haupt-Kalender computed ────────────────────────────────────────────────
  calLabel = computed(() => `${MONTHS[this.calMonth()]} ${this.calYear()}`);

  calDays = computed<{ date: string; day: number; cur: boolean; hasMark: boolean }[]>(() => {
    const y = this.calYear();
    const m = this.calMonth();
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const notizenDates = new Set(this.notizen().map(n => n.date));

    const cells: { date: string; day: number; cur: boolean; hasMark: boolean }[] = [];
    for (let blank = 0; blank < firstDow; blank++) {
      cells.push({ date: '', day: 0, cur: false, hasMark: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cells.push({ date: dateStr, day: d, cur: true, hasMark: notizenDates.has(dateStr) });
    }
    return cells;
  });

  // ── Date-Picker computed ───────────────────────────────────────────────────
  dpLabel = computed(() => `${MONTHS[this.dpMonth()]} ${this.dpYear()}`);

  dpDays = computed<{ date: string; day: number; cur: boolean }[]>(() => {
    const y = this.dpYear();
    const m = this.dpMonth();
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const cells: { date: string; day: number; cur: boolean }[] = [];
    for (let blank = 0; blank < firstDow; blank++) {
      cells.push({ date: '', day: 0, cur: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cells.push({ date: dateStr, day: d, cur: true });
    }
    return cells;
  });

  // ── Listen ────────────────────────────────────────────────────────────────
  notizenForDay = computed<Notiz[]>(() =>
    this.notizen()
      .filter(n => n.date === this.selected())
      .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
  );

  readonly todayStr = new Date().toISOString().slice(0, 10);

  notizenHeute = computed<Notiz[]>(() =>
    this.notizen()
      .filter(n => n.date === this.todayStr)
      .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
  );

  allNotizen = computed<Notiz[]>(() =>
    [...this.notizen()].sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      if (dc !== 0) return dc;
      return (a.time ?? '99:99').localeCompare(b.time ?? '99:99');
    })
  );

  // ── Klick außerhalb schließt Picker ───────────────────────────────────────
  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!this.dpOpen()) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.nz-datepicker-wrap')) {
      this.dpOpen.set(false);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void { this.load(); }

  private load(): void {
    this.loading.set(true);
    this.svc.getAll().subscribe({
      next: list => { this.notizen.set(list); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  // ── Haupt-Kalender Navigation ─────────────────────────────────────────────
  prevMonth(): void {
    if (this.calMonth() === 0) { this.calMonth.set(11); this.calYear.update(y => y - 1); }
    else { this.calMonth.update(m => m - 1); }
  }

  nextMonth(): void {
    if (this.calMonth() === 11) { this.calMonth.set(0); this.calYear.update(y => y + 1); }
    else { this.calMonth.update(m => m + 1); }
  }

  selectDay(dateStr: string): void {
    if (!dateStr) return;
    this.selected.set(dateStr);
    this.viewNotiz.set(null);
    this.showForm.set(false);
  }

  isSelected(dateStr: string): boolean { return this.selected() === dateStr; }
  isToday(dateStr: string): boolean { return dateStr === new Date().toISOString().slice(0, 10); }

  // ── Date-Picker Navigation ────────────────────────────────────────────────
  openDatePicker(e: MouseEvent): void {
    e.stopPropagation();
    // Picker auf aktuelles form.date initialisieren
    if (this.form.date) {
      const [y, m] = this.form.date.split('-').map(Number);
      this.dpYear.set(y);
      this.dpMonth.set(m - 1);
    }
    this.dpOpen.update(v => !v);
  }

  dpPrevMonth(): void {
    if (this.dpMonth() === 0) { this.dpMonth.set(11); this.dpYear.update(y => y - 1); }
    else { this.dpMonth.update(m => m - 1); }
  }

  dpNextMonth(): void {
    if (this.dpMonth() === 11) { this.dpMonth.set(0); this.dpYear.update(y => y + 1); }
    else { this.dpMonth.update(m => m + 1); }
  }

  dpSelectDay(dateStr: string, e: MouseEvent): void {
    if (!dateStr) return;
    e.stopPropagation();
    this.form.date = dateStr;
    this.dpOpen.set(false);
  }

  dpIsSelected(dateStr: string): boolean { return this.form.date === dateStr; }
  dpIsToday(dateStr: string): boolean { return dateStr === new Date().toISOString().slice(0, 10); }

  get formDateDisplay(): string {
    if (!this.form.date) return 'Datum wählen…';
    const [y, m, d] = this.form.date.split('-');
    return `${d}.${m}.${y}`;
  }

  // ── Formular ──────────────────────────────────────────────────────────────
  openNew(): void {
    this.form = this.emptyForm(this.selected() ?? undefined);
    this.editId.set(null);
    this.viewNotiz.set(null);
    this.dpOpen.set(false);
    this.showForm.set(true);
  }

  openEdit(n: Notiz): void {
    this.form = {
      date: n.date,
      time: n.time ?? '',
      allDay: !n.time,
      title: n.title,
      text: n.text,
      color: n.color,
    };
    this.editId.set(n.id);
    this.viewNotiz.set(null);
    this.dpOpen.set(false);
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editId.set(null);
    this.dpOpen.set(false);
  }

  save(): void {
    if (!this.form.title.trim()) return;
    const dto: CreateNotizDto = {
      date:  this.form.date,
      time:  this.form.allDay ? null : (this.form.time || null),
      title: this.form.title.trim(),
      text:  this.form.text.trim(),
      color: this.form.color,
    };
    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.svc.update(id, dto) : this.svc.create(dto);

    req$.subscribe({
      next: result => {
        if (id) {
          this.notizen.update(list => list.map(n => n.id === id ? result : n));
        } else {
          this.notizen.update(list => [...list, result]);
        }
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 2000);
        this.showForm.set(false);
        this.editId.set(null);
        const [y, mo] = result.date.split('-').map(Number);
        this.calYear.set(y);
        this.calMonth.set(mo - 1);
        this.selected.set(result.date);
        // Globalen Float-State aktualisieren (erscheint sofort wenn fällig)
        this.notizenState.load();
      },
      error: () => this.saving.set(false),
    });
  }

  toggleDone(n: Notiz, e: MouseEvent): void {
    e.stopPropagation();
    this.svc.toggleDone(n.id).subscribe({
      next: updated => {
        this.notizen.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.notizenState.load();
      },
    });
  }

  delete(n: Notiz): void {
    if (!confirm(`Notiz "${n.title}" wirklich löschen?`)) return;
    this.svc.delete(n.id).subscribe({
      next: () => {
        this.notizen.update(list => list.filter(x => x.id !== n.id));
        if (this.viewNotiz()?.id === n.id) this.viewNotiz.set(null);
        this.notizenState.load();
      },
    });
  }

  openView(n: Notiz): void { this.viewNotiz.set(n); this.showForm.set(false); }
  closeView(): void { this.viewNotiz.set(null); }

  // ── Helpers ───────────────────────────────────────────────────────────────
  formatDate(s: string): string {
    const [y, m, d] = s.split('-');
    return `${d}.${m}.${y}`;
  }

  colorLabel(c: ColorKey): string { return COLOR_LABELS[c]; }

  private emptyForm(date?: string): FormState {
    return {
      date:   date ?? new Date().toISOString().slice(0, 10),
      time:   '',
      allDay: true,
      title:  '',
      text:   '',
      color:  'default',
    };
  }

  creatorLabel(createdBy: NotizCreatedBy | null): string {
    if (!createdBy) return '';
    const num = createdBy.employeeNumber !== null
      ? `#${String(createdBy.employeeNumber).padStart(2, '0')} `
      : '';
    return `${num}${createdBy.name}`;
  }

  trackById(_: number, n: Notiz): string { return n.id; }
  trackByDate(_: number, c: { date: string }): string { return c.date; }
}
