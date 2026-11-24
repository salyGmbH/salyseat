import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SchichtplanungService, TimeClockEntry, TimeClockSummaryRow } from '../../services/schichtplanung.service';
import { VerifiedStaff } from '../../services/staff.service';
import { StaffIdPromptComponent } from '../../shared/staff-id-prompt/staff-id-prompt.component';

@Component({
  selector: 'app-zeiterfassung',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, TranslateModule, StaffIdPromptComponent],
  templateUrl: './zeiterfassung.component.html',
  styleUrl: './zeiterfassung.component.scss',
})
export class ZeiterfassungComponent implements OnInit {
  private readonly spService = inject(SchichtplanungService);

  infoOpen = false;

  readonly stempelPromptOpen = signal(false);
  readonly timeClockBusy     = signal(false);
  readonly timeClockMessage  = signal<string | null>(null);
  readonly timeClockError    = signal(false);

  readonly liveLoading = signal(true);
  readonly liveEntries = signal<TimeClockEntry[]>([]);

  readonly reportLoading = signal(true);
  readonly reportSummary = signal<TimeClockSummaryRow[]>([]);
  readonly reportEntries = signal<TimeClockEntry[]>([]);

  reportFrom = this.toIso(new Date(new Date().setDate(new Date().getDate() - 7)));
  reportTo   = this.toIso(new Date());

  readonly checkOutTarget = signal<TimeClockEntry | null>(null);
  checkOutNoteInput = '';

  readonly notedEntries = computed(() => this.reportEntries().filter(e => !!e.note));

  // ── Übersicht: Kennzahlen + Balken für die Auswertung ────────────────────
  readonly totalMinutes = computed(() => this.reportSummary().reduce((sum, s) => sum + s.minutes, 0));
  readonly maxEmployeeMinutes = computed(() => Math.max(1, ...this.reportSummary().map(s => s.minutes)));

  readonly avgMinutesPerDay = computed(() => {
    const days = this.daysBetween(this.reportFrom, this.reportTo);
    return Math.round(this.totalMinutes() / days);
  });

  activePreset: 'today' | 'week' | 'month' | null = 'week';

  ngOnInit(): void {
    this.loadLiveEntries();
    this.loadReport();
  }

  private toIso(date: Date): string {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  }

  private daysBetween(from: string, to: string): number {
    const diff = new Date(to).getTime() - new Date(from).getTime();
    return Math.max(1, Math.round(diff / 86_400_000) + 1);
  }

  setPreset(preset: 'today' | 'week' | 'month'): void {
    const now = new Date();
    this.activePreset = preset;

    if (preset === 'today') {
      this.reportFrom = this.toIso(now);
      this.reportTo   = this.toIso(now);
    } else if (preset === 'week') {
      const weekday = now.getDay() || 7; // Montag=1 … Sonntag=7
      const monday = new Date(now);
      monday.setDate(now.getDate() - weekday + 1);
      this.reportFrom = this.toIso(monday);
      this.reportTo   = this.toIso(now);
    } else {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      this.reportFrom = this.toIso(first);
      this.reportTo   = this.toIso(now);
    }

    this.loadReport();
  }

  onManualDateChange(): void {
    this.activePreset = null;
    this.loadReport();
  }

  barWidth(minutes: number): number {
    return (minutes / this.maxEmployeeMinutes()) * 100;
  }

  loadLiveEntries(): void {
    this.liveLoading.set(true);
    this.spService.loadTimeClockLive().subscribe({
      next: entries => { this.liveEntries.set(entries); this.liveLoading.set(false); },
      error: () => { this.liveEntries.set([]); this.liveLoading.set(false); },
    });
  }

  loadReport(): void {
    this.reportLoading.set(true);
    this.spService.loadTimeClockReport(this.reportFrom, this.reportTo).subscribe({
      next: r => {
        this.reportSummary.set(r.summary);
        this.reportEntries.set(r.entries);
        this.reportLoading.set(false);
      },
      error: () => {
        this.reportSummary.set([]);
        this.reportEntries.set([]);
        this.reportLoading.set(false);
      },
    });
  }

  openStempelPrompt(): void {
    this.timeClockMessage.set(null);
    this.stempelPromptOpen.set(true);
  }

  onStempelConfirmed(staff: VerifiedStaff & { employeeNumber: number }): void {
    this.stempelPromptOpen.set(false);
    if (this.timeClockBusy()) return;

    const alreadyIn = this.liveEntries().some(e => e.employeeId === staff.id);
    this.timeClockBusy.set(true);

    const action$ = alreadyIn
      ? this.spService.checkOut(staff.id)
      : this.spService.checkIn(staff.id);

    action$.subscribe({
      next: entry => {
        this.timeClockBusy.set(false);
        this.timeClockError.set(false);
        this.timeClockMessage.set(
          alreadyIn
            ? `${staff.name} ausgecheckt — Dauer: ${this.formatDuration(entry.durationMinutes)}`
            : `${staff.name} eingecheckt um ${new Date(entry.clockInAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`,
        );
        this.loadLiveEntries();
        this.loadReport();
      },
      error: (err) => {
        this.timeClockBusy.set(false);
        this.timeClockError.set(true);
        this.timeClockMessage.set(
          err?.status === 409
            ? `${staff.name} ist bereits ${alreadyIn ? 'ausgecheckt' : 'eingecheckt'}.`
            : 'Aktion fehlgeschlagen. Bitte erneut versuchen.',
        );
      },
    });
  }

  openManualCheckout(entry: TimeClockEntry): void {
    this.checkOutNoteInput = '';
    this.checkOutTarget.set(entry);
  }

  cancelManualCheckout(): void {
    this.checkOutTarget.set(null);
  }

  confirmManualCheckout(): void {
    const target = this.checkOutTarget();
    if (!target) return;

    this.spService.checkOut(target.employeeId, this.checkOutNoteInput || undefined).subscribe({
      next: () => {
        this.checkOutTarget.set(null);
        this.loadLiveEntries();
        this.loadReport();
      },
    });
  }

  formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h} Std. ${m} Min.` : `${m} Min.`;
  }

  formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  downloadPdf(): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFontSize(16);
    doc.setTextColor(30, 30, 30);
    doc.text('Zeiterfassung', 14, 16);

    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `${this.reportFrom} – ${this.reportTo}  ·  ${this.reportEntries().length} Einträge  ·  erstellt am ${new Date().toLocaleDateString('de-DE')}`,
      14, 23,
    );

    autoTable(doc, {
      startY: 28,
      head: [['Mitarbeiter', 'Eingecheckt', 'Ausgecheckt', 'Dauer', 'Notiz']],
      body: this.reportEntries().map(e => [
        e.employeeName,
        this.formatDateTime(e.clockInAt),
        e.clockOutAt ? this.formatDateTime(e.clockOutAt) : '—',
        this.formatDuration(e.durationMinutes),
        e.note || '',
      ]),
      styles:     { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [243, 244, 246], textColor: [50, 50, 50], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    });

    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10,
      head: [['Zusammenfassung', 'Einträge', 'Gesamtdauer']],
      body: this.reportSummary().map(s => [s.employeeName, String(s.entryCount), this.formatDuration(s.minutes)]),
      styles:     { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [231, 236, 255], textColor: [50, 50, 50], fontStyle: 'bold' },
    });

    doc.save(`Zeiterfassung_${this.reportFrom}_${this.reportTo}.pdf`);
  }
}
