import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss'
})
export class OverviewComponent {
items = [
  { label: 'Algemeine Einstellungen Administration', route: 'allgemein' },
  { label: 'Widget Einstellungen', route: 'widget' },
  { label: 'Restaurantplan', route: 'restaurantplan' },
  { label: 'Mitarbeiterverwaltung', route: 'mitarbeiter' },
  { label: 'Status, Hinweise & Gäste-Typen', route: 'status-kennzeichnungen' },
  { label: 'Packages', route: 'packages' },
  { label: 'Dokumente', route: 'dokumente' },
  { label: 'Reservirungen', route: 'reservierungen' },
  { label: 'Login / Registrierung', route: 'login' },
  { label: 'Statisticken', route: 'statistiken' },
  { label: 'Reservirungsliste', route: 'reservierungsliste' },
  { label: 'Sprachen', route: 'sprachen' },
  { label: 'Emails', route: 'emails' },
  { label: 'Sicherheit', route: 'sicherheit' },
  { label: 'Kreditkarte', route: 'kreditkarte' },
  { label: 'Automatisierte Hotelreservirung', route: 'hotel-automatisch' }
];
}