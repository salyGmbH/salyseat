import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ReservationsService } from '../../../services/reservations.service';
import { RoomsService } from '../../../services/rooms.service';
import { Reservation, ReservationStatus, STATUS_LABELS } from '../../../services/reservation.types';
import { StatusColorsService, StatusKey } from '../../../services/status-colors.service';
import { StatusIconComponent } from '../../../shared/status-icon/status-icon.component';
import { OpenDatePickerDirective } from '../../../shared/directives/open-date-picker.directive';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-reservierungsliste',
  standalone: true,
  imports: [MatIconModule, FormsModule, TranslateModule, StatusIconComponent, OpenDatePickerDirective],
  templateUrl: './reservierungsliste.component.html',
  styleUrl: './reservierungsliste.component.scss',
})
export class ReservierungslisteComponent implements OnInit {

  readonly infoOpen = signal(false);

  private readonly svc          = inject(ReservationsService);
  private readonly statusColors = inject(StatusColorsService);
  private readonly roomsService = inject(RoomsService);

  readonly reservations = this.svc.reservations;
  readonly total        = this.svc.total;
  readonly loading      = this.svc.loading;
  readonly viewMode     = this.statusColors.viewMode;

  /** true wenn eine echte E-Mail hinterlegt ist (kein …@noemail.local-Backend-Platzhalter) */
  isRealEmail(email: string | null | undefined): boolean {
    return !!email && !email.endsWith('@noemail.local');
  }

  /** Räume die in den geladenen Reservierungen vorkommen (dynamisch) */
  readonly availableRooms = computed(() => {
    const seen = new Map<string, string>();
    for (const r of this.svc.reservations()) {
      if (!seen.has(r.venue_id)) seen.set(r.venue_id, r.venue_name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  });

  /** Feste Tag-Optionen — immer sichtbar */
  private readonly predefinedTags = ['Mit Hund', 'Rollstuhl', 'Geburtstag', 'Hochzeit'];

  /** Feste Tags + alle weiteren die dynamisch in den Reservierungen vorkommen */
  readonly availableTags = computed(() => {
    const extra = new Set<string>();
    for (const r of this.svc.reservations()) {
      r.guest_gasttypen?.forEach(t => { if (!this.predefinedTags.includes(t)) extra.add(t); });
      r.guest_hinweise?.forEach(t => { if (!this.predefinedTags.includes(t)) extra.add(t); });
    }
    return [
      ...this.predefinedTags,
      ...Array.from(extra).sort((a, b) => a.localeCompare(b, 'de')),
    ];
  });

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
  filterFrom      = '';
  filterTo        = '';   // leer = nur filterFrom als Einzeltag
  activeStatuses: string[] = [];
  activeVenues:   string[] = [];
  activeTags:     string[] = [];
  filterWithNote  = false;
  sortBy:         'time' | 'alpha' | 'table' = 'time';
  actionError     = signal<string | null>(null);

  readonly sortOptions: { value: 'time' | 'alpha' | 'table'; label: string; icon: string }[] = [
    { value: 'time',  label: 'reservierungsliste.sort_time',  icon: 'schedule'         },
    { value: 'alpha', label: 'reservierungsliste.sort_alpha', icon: 'sort_by_alpha'    },
    { value: 'table', label: 'reservierungsliste.sort_table', icon: 'table_restaurant' },
  ];

  readonly statusOptions = [
    { value: 'pending',   label: 'reservierungsliste.status_pending'   },
    { value: 'confirmed', label: 'reservierungsliste.status_confirmed' },
    { value: 'seated',    label: 'reservierungsliste.status_active'    },
    { value: 'completed', label: 'reservierungsliste.status_completed' },
    { value: 'cancelled', label: 'reservierungsliste.status_cancelled' },
    { value: 'no_show',   label: 'reservierungsliste.status_no_show'   },
  ];

  toggleStatusFilter(value: string): void {
    this.activeStatuses = this.activeStatuses.includes(value)
      ? this.activeStatuses.filter(s => s !== value)
      : [...this.activeStatuses, value];
  }

  toggleVenueFilter(id: string): void {
    this.activeVenues = this.activeVenues.includes(id)
      ? this.activeVenues.filter(v => v !== id)
      : [...this.activeVenues, id];
  }

  toggleTagFilter(tag: string): void {
    this.activeTags = this.activeTags.includes(tag)
      ? this.activeTags.filter(t => t !== tag)
      : [...this.activeTags, tag];
  }

  // ── Export (direkt aus aktiven Filtern) ───────────────────────────────
  printReservations: Reservation[] = [];

  dateLabel(): string {
    if (!this.filterTo || this.filterFrom === this.filterTo) return this.filterFrom;
    return `${this.filterFrom} – ${this.filterTo}`;
  }

  startExport(mode: 'print' | 'pdf'): void {
    const data = this.filteredReservations;
    if (mode === 'print') {
      this.printReservations = data;
      setTimeout(() => { window.print(); this.printReservations = []; }, 120);
    } else {
      this.downloadPdf(data);
    }
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
      head: [['Datum / Zeit', 'Gast', 'Anlass', 'Pers.', 'E-Mail', 'Telefon', 'Status', 'Notiz']],
      body: data.map(r => [
        `${this.formatDate(r.starts_at)}\n${this.formatTime(r.starts_at)} – ${this.formatTime(r.ends_at)}`,
        r.guest_first_name ? `${r.guest_first_name} ${r.guest_name}` : r.guest_name,
        r.occasion ?? '',
        String(r.party_size),
        this.isRealEmail(r.guest_email) ? r.guest_email : '—',
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
    this.filterFrom = this.getToday();
    this.filterTo   = '';   // kein Enddatum → Einzeltag
    this.load();
  }

  private getToday(): string {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString().split('T')[0];
  }

  load(): void {
    this.actionError.set(null);
    const hasRange = this.filterFrom && this.filterTo;
    this.svc.load({
      date:     !hasRange && this.filterFrom ? this.filterFrom : undefined,
      dateFrom: hasRange ? this.filterFrom : undefined,
      dateTo:   hasRange ? this.filterTo   : undefined,
    }).subscribe();
  }

  /** Reservierungen gefiltert (Status + Raum) und sortiert */
  get filteredReservations(): Reservation[] {
    let list = this.svc.reservations();

    if (this.activeStatuses.length) {
      list = list.filter(r => this.activeStatuses.includes(r.status));
    }
    if (this.activeVenues.length) {
      list = list.filter(r => this.activeVenues.includes(r.venue_id));
    }
    if (this.activeTags.length) {
      list = list.filter(r =>
        this.activeTags.every(tag =>
          r.guest_gasttypen?.includes(tag) || r.guest_hinweise?.includes(tag)
        )
      );
    }
    if (this.filterWithNote) {
      list = list.filter(r => r.guest_notes && r.guest_notes.trim().length > 0);
    }

    switch (this.sortBy) {
      case 'alpha':
        return [...list].sort((a, b) => a.guest_name.localeCompare(b.guest_name, 'de'));
      case 'table':
        return [...list].sort((a, b) => (a.table_number ?? 9999) - (b.table_number ?? 9999));
      default: // 'time'
        // Direkter String-Vergleich statt new Date().getTime() — starts_at ist
        // ein konsistent formatierter ISO-String, der lexikografisch bereits
        // chronologisch sortiert (siehe formatDate()/formatTime() oben zur
        // Begründung, warum new Date() hier vermieden wird).
        return [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
  }

  resetToToday(): void {
    this.filterFrom      = this.getToday();
    this.filterTo        = '';
    this.activeStatuses  = [];
    this.activeVenues    = [];
    this.activeTags      = [];
    this.filterWithNote  = false;
    this.sortBy          = 'time';
    this.load();
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  statusLabel(s: string): string {
    return STATUS_LABELS[s as ReservationStatus] ?? s;
  }

  /**
   * WICHTIG: NICHT `new Date(iso).toLocaleDateString()/toLocaleTimeString()`
   * verwenden — das Backend liefert `starts_at` zwar mit UTC-Offset-Suffix
   * (`\DateTimeInterface::ATOM`), der numerische Wert ist aber die
   * tatsächliche lokale Uhrzeit des Venues, keine echte UTC-Zeit. `new Date()`
   * würde diesen Wert daher fälschlich als UTC interpretieren und beim
   * Anzeigen in die Zeitzone des BROWSERS/Geräts konvertieren — bei einer
   * abweichenden Geräte-Zeitzone (z. B. unterwegs) verschieben sich die
   * angezeigten Uhrzeiten dann um mehrere Stunden und passen nicht mehr zu
   * den Öffnungszeiten. Stattdessen wird Datum/Uhrzeit direkt aus dem
   * ISO-String geschnitten — exakt wie in floor-reservations.service.ts /
   * raum-detail.component.ts.
   */
  formatDate(iso: string): string {
    return this.toLocalComponentsDate(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatTime(iso: string): string {
    return iso.substring(11, 16);
  }

  /**
   * Baut ein Date-Objekt NUR aus den lokalen Y/M/D/H/m-Komponenten des
   * ISO-Strings auf (Date-Konstruktor mit einzelnen Zahlen, nicht der
   * ISO-String-Konstruktor) — dadurch liest `toLocaleDateString()` exakt
   * dieselben Komponenten wieder aus, unabhängig von der Zeitzone des
   * Geräts. Nur für formatierte Datumsanzeige (Wochentag etc.) nötig; die
   * Uhrzeit wird oben direkt per substring() ausgegeben.
   */
  private toLocalComponentsDate(iso: string): Date {
    const y  = Number(iso.substring(0, 4));
    const mo = Number(iso.substring(5, 7));
    const d  = Number(iso.substring(8, 10));
    return new Date(y, mo - 1, d);
  }

  /** "2× Bday Feier, 1× Aperitif" — für Anzeige in der Reservierungsliste. */
  packageSummary(r: Reservation): string {
    return (r.packages ?? [])
      .map(p => `${p.quantity}× ${p.package_name}`)
      .join(', ');
  }
}
