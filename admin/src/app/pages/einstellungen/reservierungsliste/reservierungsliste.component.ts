import { Component, OnInit, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { ReservationsService } from '../../../services/reservations.service';
import { Reservation, ReservationStatus, STATUS_LABELS } from '../../../services/reservation.types';

@Component({
  selector: 'app-reservierungsliste',
  standalone: true,
  imports: [MatIconModule, FormsModule],
  templateUrl: './reservierungsliste.component.html',
  styleUrl: './reservierungsliste.component.scss',
})
export class ReservierungslisteComponent implements OnInit {
  private readonly svc = inject(ReservationsService);

  readonly reservations = this.svc.reservations;
  readonly total        = this.svc.total;
  readonly loading      = this.svc.loading;

  filterDate   = '';
  filterStatus = '';
  actionError  = signal<string | null>(null);

  readonly statusOptions = [
    { value: '',          label: 'Alle Status' },
    { value: 'pending',   label: 'Ausstehend' },
    { value: 'confirmed', label: 'Bestätigt' },
    { value: 'cancelled', label: 'Storniert' },
    { value: 'no_show',   label: 'No-Show' },
  ];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.actionError.set(null);
    this.svc.load({
      date:   this.filterDate   || undefined,
      status: this.filterStatus || undefined,
    }).subscribe();
  }

  confirm(id: string): void {
    this.actionError.set(null);
    this.svc.confirm(id).subscribe({
      error: () => this.actionError.set('Bestätigung fehlgeschlagen.'),
    });
  }

  markNoShow(id: string): void {
    this.actionError.set(null);
    this.svc.markNoShow(id).subscribe({
      error: () => this.actionError.set('No-Show konnte nicht gesetzt werden.'),
    });
  }

  statusLabel(status: string): string {
    return STATUS_LABELS[status as ReservationStatus] ?? status;
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  canConfirm(r: Reservation): boolean {
    return r.status === 'pending';
  }

  canMarkNoShow(r: Reservation): boolean {
    return r.status === 'pending' || r.status === 'confirmed';
  }
}
