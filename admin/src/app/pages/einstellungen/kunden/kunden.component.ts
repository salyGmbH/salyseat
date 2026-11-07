import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { GuestsService, Guest } from '../../../services/guests.service';

@Component({
  selector: 'app-kunden',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './kunden.component.html',
  styleUrl: './kunden.component.scss'
})
export class KundenComponent implements OnInit {
  private readonly guestsService = inject(GuestsService);

  // Bestehende Feature-Liste (bleibt oben)
  features = [
    { icon: 'people',         label: 'Gäste-Datenbank mit Historie' },
    { icon: 'star',           label: 'Stammgäste markieren & favorisieren' },
    { icon: 'label',          label: 'Tags (Allergien, Vorlieben, VIP)' },
    { icon: 'warning',        label: 'Blacklist für No-Shows' },
    { icon: 'cake',           label: 'Geburtstags-Erinnerungen' },
    { icon: 'trending_up',    label: 'Umsatz & Besuchsfrequenz pro Gast' },
  ];

  // Gästeliste
  guests   = signal<Guest[]>([]);
  total    = signal(0);
  loading  = signal(false);
  search   = signal('');
  searchInput = '';

  ngOnInit(): void {
    this.loadGuests();
  }

  loadGuests(): void {
    this.loading.set(true);
    this.guestsService.load({ search: this.search() || undefined }).subscribe(res => {
      this.guests.set(res.guests);
      this.total.set(res.total);
      this.loading.set(false);
    });
  }

  onSearch(): void {
    this.search.set(this.searchInput.trim());
    this.loadGuests();
  }

  clearSearch(): void {
    this.searchInput = '';
    this.search.set('');
    this.loadGuests();
  }

  reliabilityClass(score: number): string {
    if (score >= 90) return 'score--green';
    if (score >= 70) return 'score--yellow';
    return 'score--red';
  }

  initials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }
}
