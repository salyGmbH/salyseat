import { Component, OnInit, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { ReservationsService } from '../../../services/reservations.service';
import { Reservation, ReservationStatus, STATUS_LABELS } from '../../../services/reservation.types';
import { StatusColorsService, StatusKey } from '../../../services/status-colors.service';
import { StatusIconComponent } from '../../../shared/status-icon/status-icon.component';

@Component({
  selector: 'app-reservierungsliste',
  standalone: true,
  imports: [MatIconModule, FormsModule, StatusIconComponent],
  templateUrl: './reservierungsliste.component.html',
  styleUrl: './reservierungsliste.component.scss',
})
export class ReservierungslisteComponent implements OnInit {

  private readonly svc          = inject(ReservationsService);
  private readonly statusColors = inject(StatusColorsService);

  readonly reservations = this.svc.reservations;
  readonly total        = this.svc.total;
  readonly loading      = this.svc.loading;

  /** Anzeigemodus (Farbe / Text / Icons) — wird zentral in den Status-Einstellungen gesetzt. */
  readonly viewMode = this.statusColors.viewMode;

  /**
   * Mapping: Buchungs-Status (ReservationStatus) → operativer StatusKey,
   * den die Farb-/Icon-Konfiguration kennt. So nutzt die Reservierungsliste
   * dieselbe Farbpalette wie die Raumübersicht.
   */
  private readonly bookingStatusToKey: Record<ReservationStatus, StatusKey> = {
    pending:   'waiting',
    confirmed: 'active',
    cancelled: 'cancelled',
    no_show:   'no_show',
  };

  /** Farbe (aus Status-Einstellungen) für einen Buchungs-Status. */
  colorForBooking(s: ReservationStatus): string {
    return this.statusColors.colorFor(this.bookingStatusToKey[s]);
  }

  /** Icon-ID (aus Status-Einstellungen) für einen Buchungs-Status. */
  iconForBooking(s: ReservationStatus): string {
    return this.statusColors.iconFor(this.bookingStatusToKey[s]);
  }

  /** Label (aus Status-Einstellungen) — fällt auf den Standard-Label-Mapping zurück. */
  labelForBooking(s: ReservationStatus): string {
    return this.statusColors.labelFor(this.bookingStatusToKey[s]);
  }

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

  filterDate = '';
  filterStatus = '';
  actionError  = signal<string | null>(null);

  // ✅ PRINT STATE
  showPrintModal = signal(false);

  printMode: 'day' | 'range' = 'day';
  printFrom = '';
  printTo = '';
  printReservations: Reservation[] = [];

  selectedStatuses: string[] = [];

  readonly statusOptions = [
    { value: '',          label: 'Alle Status' },
    { value: 'pending',   label: 'Ausstehend' },
    { value: 'confirmed', label: 'Bestätigt' },
    { value: 'cancelled', label: 'Storniert' },
    { value: 'no_show',   label: 'No-Show' },
  ];

  // ─────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.filterDate = this.getToday();
    this.load();
  }

  // ✅ FIX: korrektes lokales Datum (kein UTC shift)
  private getToday(): string {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const local = new Date(today.getTime() - offset * 60000);
    return local.toISOString().split('T')[0];
  }

  // ─────────────────────────────────────────────────────────
  // PRINT MODAL

  openPrintModal(): void {
    this.showPrintModal.set(true);

    // default setzen
    this.printMode = 'day';
    this.printFrom = this.filterDate;
    this.printTo   = this.filterDate;
    this.selectedStatuses = [];
  }

  closePrintModal(): void {
    this.showPrintModal.set(false);
  }

  toggleStatus(status: string): void {
    if (!status) return;

    if (this.selectedStatuses.includes(status)) {
      this.selectedStatuses = this.selectedStatuses.filter(s => s !== status);
    } else {
      this.selectedStatuses.push(status);
    }
  }

  // ─────────────────────────────────────────────────────────
  // PRINT LOGIK (FIXED)

  print(): void {
    let data = [...this.reservations()];

    // ✅ 1. Datum / Zeitraum korrekt filtern
    if (this.printMode === 'day') {
      data = data.filter(r =>
        r.starts_at.startsWith(this.printFrom)
      );
    } else if (this.printFrom && this.printTo) {
      data = data.filter(r => {
        const date = r.starts_at.split('T')[0];
        return date >= this.printFrom && date <= this.printTo;
      });
    }

    // ✅ 2. Status filtern
    if (this.selectedStatuses.length > 0) {
      data = data.filter(r =>
        this.selectedStatuses.includes(r.status)
      );
    }

    // ✅ 3. Sortieren (wichtig für Druck)
    data.sort((a, b) =>
      new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    );

    // speichern für Template
    this.printReservations = data;

    // Modal schließen
    this.closePrintModal();

    // kurz warten → dann drucken
    setTimeout(() => {
      window.print();

      // ✅ Reset danach (wichtig!)
      this.printReservations = [];

    }, 100);
  }

  // ─────────────────────────────────────────────────────────
  // DATA LOAD

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

  // ─────────────────────────────────────────────────────────
  // HELPERS
  //
  // Hinweis: Status-Aktionen (Bestätigen / No-Show / Stornieren) wurden
  // bewusst entfernt — alle Status-Änderungen laufen über die Raumübersicht.
  // Diese Liste ist eine reine Druck- & Übersichtsansicht.

  statusLabel(status: string): string {
    return STATUS_LABELS[status as ReservationStatus] ?? status;
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}