import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

interface SettingsItem {
  label: string;
  route: string;
  icon?: string;
}

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss'
})
export class OverviewComponent {
  items: SettingsItem[] = [
    { label: 'Allgemeine Einstellungen',        route: 'allgemein',              icon: 'tune' },
    { label: 'Widget-Designer',                 route: 'widget',                 icon: 'palette' },
    { label: 'Widget Einstellungen',            route: 'widget-einstellungen',   icon: 'widgets' },
   // { label: 'Restaurantplan',                  route: 'restaurantplan',         icon: 'table_restaurant' },
    { label: 'Mitarbeiterverwaltung',           route: 'mitarbeiter',            icon: 'group' },
    { label: 'Berechtigungen',                  route: 'rechte',                 icon: 'admin_panel_settings' },
    { label: 'Status, Hinweise & Gäste-Typen',  route: 'status-kennzeichnungen', icon: 'flag' },
    { label: 'Packages',                        route: 'packages',               icon: 'inventory_2' },
    { label: 'Dokumente',                       route: 'dokumente',              icon: 'description' },
    { label: 'Reservierungen',                  route: 'reservierungen',         icon: 'event_available' },
    { label: 'Benachrichtigungen',              route: 'notifications',          icon: 'notifications_active' },
    { label: 'Öffnungszeiten',                  route: 'oeffnungszeiten',        icon: 'schedule' },
    // TEMPORÄR ausgeblendet — wieder aktivieren wenn Funktion fertig:
    // { label: 'Integrationen',                   route: 'integrationen',          icon: 'extension' },
    // { label: 'Backup & Export',                 route: 'backup',                 icon: 'backup' },
    { label: 'Branding',                        route: 'branding',               icon: 'palette' },
    { label: 'Kunden',                    route: 'kunden',                 icon: 'groups' },
    { label: 'Login / Registrierung',           route: 'login',                  icon: 'login' },
    { label: 'Reservierungsliste',              route: 'reservierungsliste',     icon: 'list_alt' },
    { label: 'Sprachen',                        route: 'sprachen',               icon: 'translate' },
    { label: 'E-Mails',                         route: 'emails',                 icon: 'mail' },
    // TEMPORÄR ausgeblendet — wieder aktivieren wenn Funktion fertig:
    // { label: 'Sicherheit',                      route: 'sicherheit',             icon: 'security' },
    // { label: 'Kreditkarte',                     route: 'kreditkarte',            icon: 'credit_card' },
    // { label: 'Automatisierte Hotelreservierung', route: 'hotel-automatisch',     icon: 'hotel' },
  ];
}
