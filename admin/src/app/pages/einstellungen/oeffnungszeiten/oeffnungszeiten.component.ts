import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { VenueService } from '../../../services/venue.service';
import {
  OpeningHoursService,
  DayHours,
  SpecialClosing,
  CreateSpecialClosingDto,
} from '../../../services/opening-hours.service';

interface BreakRow { from: string; to: string; }

interface DayRow {
  weekday: number;
  label: string;
  open: boolean;
  open_time: string;
  close_time: string;
  breaks: BreakRow[];
}

interface NewClosing {
  date_from: string;
  date_to: string;
  reason: string;
  full_day: boolean;
  open_time: string;
  close_time: string;
}

const WEEKDAY_LABELS = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];

@Component({
  selector: 'app-oeffnungszeiten',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './oeffnungszeiten.component.html',
  styleUrl: './oeffnungszeiten.component.scss',
})
export class OeffnungszeitenComponent implements OnInit {
  private readonly ohService    = inject(OpeningHoursService);
  private readonly venueService = inject(VenueService);

  /** Öffnungszeiten hängen im Backend an einem Raum – wir nehmen den ersten. */
  private venueId = '';

  // ── Opening hours ─────────────────────────────────────────────────────────
  days        = signal<DayRow[]>([]);
  loadingDays = signal(false);
  savingDays  = signal(false);
  savedDays   = signal(false);

  // ── Special closings ──────────────────────────────────────────────────────
  closings        = signal<SpecialClosing[]>([]);
  loadingClosings = signal(false);
  showAddForm     = signal(false);
  savingClosing   = signal(false);

  newClosing: NewClosing = this.emptyClosing();

  ngOnInit(): void {
    this.venueService.load().subscribe(res => {
      if (!res.venues.length) return;
      this.venueId = res.venues[0].id;
      this.loadHours();
      this.loadClosings();
    });
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  private loadHours(): void {
    this.loadingDays.set(true);
    this.ohService.getHours(this.venueId).subscribe({
      next: data => {
        this.days.set(data.map(d => this.toDayRow(d)));
        this.loadingDays.set(false);
      },
      error: () => this.loadingDays.set(false),
    });
  }

  private loadClosings(): void {
    this.loadingClosings.set(true);
    this.ohService.getSpecialClosings(this.venueId).subscribe({
      next: data => {
        this.closings.set(data);
        this.loadingClosings.set(false);
      },
      error: () => this.loadingClosings.set(false),
    });
  }

  // ── Days editing ──────────────────────────────────────────────────────────

  toggleDay(day: DayRow): void {
    day.open = !day.open;
    if (!day.open) { day.breaks = []; }
    this.days.update(d => [...d]);
  }

  addBreak(day: DayRow): void {
    day.breaks = [...day.breaks, { from: '', to: '' }];
    this.days.update(d => [...d]);
  }

  removeBreak(day: DayRow, idx: number): void {
    day.breaks = day.breaks.filter((_, i) => i !== idx);
    this.days.update(d => [...d]);
  }

  saveHours(): void {
    const payload: DayHours[] = this.days().map(d => ({
      weekday:    d.weekday,
      open:       d.open,
      open_time:  d.open ? d.open_time  || null : null,
      close_time: d.open ? d.close_time || null : null,
      breaks:     d.open ? d.breaks.filter(b => b.from && b.to) : [],
    }));

    this.savingDays.set(true);
    this.ohService.saveHours(this.venueId, payload).subscribe({
      next: () => {
        this.savingDays.set(false);
        this.savedDays.set(true);
        setTimeout(() => this.savedDays.set(false), 2500);
      },
      error: () => this.savingDays.set(false),
    });
  }

  // ── Special closings ──────────────────────────────────────────────────────

  openAddForm(): void {
    this.newClosing = this.emptyClosing();
    this.showAddForm.set(true);
  }

  cancelAdd(): void {
    this.showAddForm.set(false);
  }

  createClosing(): void {
    const dto: CreateSpecialClosingDto = {
      date_from: this.newClosing.date_from,
      date_to:   this.newClosing.date_to,
      full_day:  this.newClosing.full_day,
    };
    if (this.newClosing.reason.trim()) dto.reason = this.newClosing.reason.trim();
    if (!this.newClosing.full_day) {
      dto.open_time  = this.newClosing.open_time;
      dto.close_time = this.newClosing.close_time;
    }

    this.savingClosing.set(true);
    this.ohService.createSpecialClosing(this.venueId, dto).subscribe({
      next: sc => {
        this.closings.update(list => [...list, sc]);
        this.showAddForm.set(false);
        this.savingClosing.set(false);
      },
      error: () => this.savingClosing.set(false),
    });
  }

  deleteClosing(id: string): void {
    this.ohService.deleteSpecialClosing(this.venueId, id).subscribe({
      next: () => this.closings.update(list => list.filter(c => c.id !== id)),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private toDayRow(d: DayHours): DayRow {
    return {
      weekday:    d.weekday,
      label:      WEEKDAY_LABELS[d.weekday] ?? `Tag ${d.weekday}`,
      open:       d.open,
      open_time:  d.open_time  ?? '08:00',
      close_time: d.close_time ?? '22:00',
      breaks:     (d.breaks ?? []).map(b => ({ from: b.from, to: b.to })),
    };
  }

  private emptyClosing(): NewClosing {
    const today = new Date().toISOString().slice(0, 10);
    return { date_from: today, date_to: today, reason: '', full_day: true, open_time: '08:00', close_time: '22:00' };
  }

  trackByWeekday(_: number, d: DayRow): number { return d.weekday; }
  trackById(_: number, c: SpecialClosing): string { return c.id; }
  trackByIdx(i: number): number { return i; }

  formatDate(s: string): string {
    const [y, m, d] = s.split('-');
    return `${d}.${m}.${y}`;
  }
}
