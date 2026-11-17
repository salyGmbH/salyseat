import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { PmsService, PmsGuest } from '../../services/pms.service';

@Component({
  selector: 'app-hotelgaeste',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: './hotelgaeste.component.html',
  styleUrl: './hotelgaeste.component.scss',
})
export class HotelgaesteComponent implements OnInit {
  private readonly pms    = inject(PmsService);
  private readonly router = inject(Router);

  readonly enabled     = signal(false);
  readonly inHouse     = signal<PmsGuest[]>([]);
  readonly searchResults = signal<PmsGuest[]>([]);
  readonly loadingInHouse  = signal(true);
  readonly loadingSearch   = signal(false);
  readonly error       = signal<string | null>(null);

  searchQuery = '';
  activeTab: 'inhouse' | 'search' = 'inhouse';

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.pms.status().subscribe(s => {
      this.enabled.set(s.enabled);
      if (s.enabled) {
        this.loadInHouse();
      } else {
        this.loadingInHouse.set(false);
      }
    });
  }

  private loadInHouse(): void {
    this.loadingInHouse.set(true);
    this.pms.getInHouseGuests().subscribe({
      next: res => { this.inHouse.set(res.guests); this.loadingInHouse.set(false); },
      error: () => { this.error.set('Verbindung zu Mews fehlgeschlagen.'); this.loadingInHouse.set(false); },
    });
  }

  onSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const q = this.searchQuery.trim();
    if (q.length < 2) { this.searchResults.set([]); return; }

    this.activeTab = 'search';
    this.loadingSearch.set(true);

    this.searchTimer = setTimeout(() => {
      this.pms.searchGuests(q).subscribe({
        next: res => { this.searchResults.set(res.guests); this.loadingSearch.set(false); },
        error: () => { this.loadingSearch.set(false); },
      });
    }, 300);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults.set([]);
    this.activeTab = 'inhouse';
  }

  fullName(g: PmsGuest): string {
    return [g.firstName, g.lastName].filter(Boolean).join(' ');
  }

  fmtDate(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  countryFlag(code: string | null | undefined): string {
    if (!code || code.length !== 2) return '';
    return String.fromCodePoint(
      0x1F1E6 + code.toUpperCase().charCodeAt(0) - 65,
      0x1F1E6 + code.toUpperCase().charCodeAt(1) - 65,
    );
  }

  personLabel(g: PmsGuest): string {
    const adults   = g.adultCount ?? 1;
    const children = g.childCount ?? 0;
    let label = `${adults} Erw.`;
    if (children > 0) label += `, ${children} Kind${children > 1 ? 'er' : ''}`;
    return label;
  }

  reserveTable(g: PmsGuest): void {
    const params: Record<string, string> = {
      prefillName: this.fullName(g),
      prefillSize: String((g.adultCount ?? 1) + (g.childCount ?? 0)),
    };
    if (g.email) params['prefillEmail'] = g.email;
    if (g.phone) params['prefillPhone'] = g.phone;
    this.router.navigate(['/raum'], { queryParams: params });
  }
}