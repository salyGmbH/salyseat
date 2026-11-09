import { Component, OnInit, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ReservationsService } from '../../../services/reservations.service';
import { Reservation, ReservationStatus, STATUS_LABELS } from '../../../services/reservation.types';
import { StatusColorsService, StatusKey } from '../../../services/status-colors.service';
import { StatusIconComponent } from '../../../shared/status-icon/status-icon.component';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-reservierungsliste',
  standalone: true,
  imports: [MatIconModule, FormsModule, TranslateModule, StatusIconComponent],
  templateUrl: './reservierungsliste.component.html',
  styleUrl: './reservierungsliste.component.scss',
})
export class ReservierungslisteComponent implements OnInit {

  private readonly svc          = inject(ReservationsService);
  private readonly statusColors = inject(StatusColorsService);

  readonly reservations = this.svc.reservations;
  readonly total        = this.svc.total;
  readonly loading      = this.svc.loading;
  readonly viewMode     = this.statusColors.viewMode;

  private readonly bookingStatusToKey: Record<ReservationStatus, StatusKey> = {
    pending:   'waiting',
    confirmed: 'confirmed',
    seated:    'active',
    cleanup:   'cleanup',
    completed: 'completed',
    cancelled: 'cancelled',
    no_show:   'no_show',
  };

  colorForBooking(s: ReservationStatus): string { return this.statusColors.colorFor(this.bookingStatusToKey[s]); }
  iconForBooking(s:  ReservationStatus): string { return this.statusColors.iconFor(this.bookingStatusToKey[s]);  }
  labelForBooking(s: ReservationStatus): string { return this.statusColors.labelFor(this.bookingStatusToKey[s]); }

  textColorFor(hex: string): string {
    if (!hex || !hex.startsWith('#')) return '#fff';
    const c = hex.substring(1);
    const rgb = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >>  8) & 0xff;
    const b =  rgb        & 0xff;
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#000' : '#fff';
  }

  // ── Filter ────────────────────────────────────────────────────────────
  filterDate   = '';
  filterStatus = '';
  actionError  = signal<string | null>(null);

  readonly statusOptions = [
    { value: '',          label: 'Alle Status' },
    { value: 'pending',   label: 'Ausstehend'  },
    { value: 'confirmed', label: 'Bestätigt'   },
    { value: 'cancelled', label: 'Storniert'   },
    { value: 'no_show',   label: 'No-Show'     },
  ];

  // ── Export-Modal ───────────────────────────────────────────────────────
  exportModal     = signal(false);
  exportMode:     'print' | 'pdf' = 'print';
  exportRange:    'day' | 'range' = 'day';
  exportFrom      = '';
  exportTo        = '';
  selectedStatuses: string[] = [];

  openExportModal(mode: 'print' | 'pdf'): void {
    this.exportMode  = mode;
    this.exportRange = 'day';
    this.exportFrom  = this.filterDate;
    this.exportTo    = this.filterDate;
    this.selectedStatuses = [];
    this.exportModal.set(true);
  }

  closeExportModal(): void { this.exportModal.set(false); }

  toggleStatus(value: string): void {
    this.selectedStatuses = this.selectedStatuses.includes(value)
      ? this.selectedStatuses.filter(s => s !== value)
      : [...this.selectedStatuses, value];
  }

  // ── Daten für Export aufbereiten ───────────────────────────────────────
  private filterExportData(data: Reservation[]): Reservation[] {
    let result = [...data];
    if (this.selectedStatuses.length) {
      result = result.filter(r => this.selectedStatuses.includes(r.status));
    }
    return result.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }

  private getExportData(): Reservation[] {
    let data = [...this.reservations()];

    if (this.exportRange === 'day') {
      data = data.filter(r => r.starts_at.startsWith(this.exportFrom));
    } else if (this.exportFrom && this.exportTo) {
      data = data.filter(r => {
        const d = r.starts_at.split('T')[0];
        return d >= this.exportFrom && d <= this.exportTo;
      });
    }

    if (this.selectedStatuses.length) {
      data = data.filter(r => this.selectedStatuses.includes(r.status));
    }

    return data.sort((a, b) =>
      new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    );
  }

  dateLabel(): string {
    if (this.exportRange === 'day') return this.exportFrom;
    return `${this.exportFrom} – ${this.exportTo}`;
  }

  // ── Drucken ────────────────────────────────────────────────────────────
  printReservations: Reservation[] = [];

  runExport(): void {
    this.closeExportModal();

    if (this.exportRange === 'range' && this.exportFrom && this.exportTo) {
      const statusFilter = this.selectedStatuses.length === 1 ? this.selectedStatuses[0] : undefined;
      this.svc.loadForExport({ status: statusFilter, dateFrom: this.exportFrom, dateTo: this.exportTo })
        .subscribe(all => {
          const data = this.filterExportData(all);
          if (this.exportMode === 'print') {
            this.printReservations = data;
            setTimeout(() => { window.print(); this.printReservations = []; }, 120);
          } else {
            this.downloadPdf(data);
          }
        });
      return;
    }

    const data = this.getExportData();

    if (this.exportMode === 'print') {
      this.printReservations = data;
      setTimeout(() => {
        window.print();
        this.printReservations = [];
      }, 120);
      return;
    }

    this.downloadPdf(data);
  }

  private downloadPdf(data: Reservation[]): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFontSize(16);
    doc.setTextColor(30, 30, 30);
    doc.text('Reservierungen', 14, 16);

    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `${this.dateLabel()}  ·  ${data.length} Einträge  ·  erstellt am ${new Date().toLocaleDateString('de-DE')}`,
      14, 23,
    );

    autoTable(doc, {
      startY: 28,
      head: [['Datum / Zeit', 'Gast', 'Pers.', 'E-Mail', 'Telefon', 'Status', 'Notiz']],
      body: data.map(r => [
        `${this.formatDate(r.starts_at)}\n${this.formatTime(r.starts_at)} – ${this.formatTime(r.ends_at)}`,
        r.guest_name,
        String(r.party_size),
        r.guest_email,
        r.guest_phone ?? '—',
        STATUS_LABELS[r.status as ReservationStatus] ?? r.status,
        r.guest_notes ?? '',
      ]),
      styles:     { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [243, 244, 246], textColor: [50, 50, 50], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: { 2: { halign: 'center' } },
    });

    const filename = `Reservierungen_${this.dateLabel().replace(/\s/g, '')}.pdf`;
    doc.save(filename);
  }

  // ── Laden ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.filterDate = this.getToday();
    this.load();
  }

  private getToday(): string {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString().split('T')[0];
  }

  load(): void {
    this.actionError.set(null);
    this.svc.load({
      date:   this.filterDate   || undefined,
      status: this.filterStatus || undefined,
    }).subscribe();
  }

  resetToToday(): void {
    this.filterDate = this.getToday();
    this.load();
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  statusLabel(s: string): string {
    return STATUS_LABELS[s as ReservationStatus] ?? s;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
}
