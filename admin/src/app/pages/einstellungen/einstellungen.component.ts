import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon'; 
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-einstellungen',
  standalone: true,
imports: [CommonModule, MatIconModule, RouterLink, PageHeaderComponent,  RouterOutlet],
  templateUrl: './einstellungen.component.html',
  styleUrl: './einstellungen.component.scss'
})
export class EinstellungenComponent {
items = [
  { label: 'Algemeine Einstellungen Administration', route: 'allgemein' },
  { label: 'Widget Einstellungen', route: 'widget' },
  { label: 'Restaurantplan', route: 'restaurantplan' },
  { label: 'Mitarbeiterverwaltung', route: 'mitarbeiter' },
  { label: 'Status & Farben', route: 'status-farben' },
  { label: 'Hinweisfarben, Gäste SVGS', route: 'hinweisfarben' },
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