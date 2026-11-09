import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

interface SettingsItem {
  label: string;
  route: string;
  icon?: string;
}

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, TranslateModule],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss'
})
export class OverviewComponent {
  items: SettingsItem[] = [
    { label: 'settings.general',          route: 'allgemein',              icon: 'tune' },
    { label: 'settings.notifications',    route: 'notifications',          icon: 'notifications_active' },
    { label: 'settings.permissions',      route: 'rechte',                 icon: 'admin_panel_settings' },
    { label: 'settings.branding',         route: 'branding',               icon: 'palette' },
    { label: 'settings.emails',           route: 'emails',                 icon: 'mail' },
    { label: 'settings.customers',        route: 'kunden',                 icon: 'groups' },
    { label: 'settings.login',            route: 'login',                  icon: 'login' },
    { label: 'settings.staff',            route: 'mitarbeiter',            icon: 'group' },
    { label: 'settings.notes',            route: 'notizen',                icon: 'sticky_note_2' },
    { label: 'settings.opening_hours',    route: 'oeffnungszeiten',        icon: 'schedule' },
    { label: 'settings.packages',         route: 'packages',               icon: 'inventory_2' },
    { label: 'settings.reservations',     route: 'reservierungen',         icon: 'event_available' },
    { label: 'settings.reservation_list', route: 'reservierungsliste',     icon: 'list_alt' },
    // { label: 'Restaurantplan',                  route: 'restaurantplan',         icon: 'table_restaurant' },
    { label: 'settings.languages',        route: 'sprachen',               icon: 'translate' },
    { label: 'settings.status_labels',    route: 'status-kennzeichnungen', icon: 'flag' },
    { label: 'Speisekarte',               route: 'speisekarte',            icon: 'menu_book' },
    { label: 'settings.widget_designer',  route: 'widget',                 icon: 'palette' },
    { label: 'settings.widget_settings',  route: 'widget-einstellungen',   icon: 'widgets' },
    // TEMPORÄR ausgeblendet — wieder aktivieren wenn Funktion fertig:
    // { label: 'Automatisierte Hotelreservierung', route: 'hotel-automatisch',     icon: 'hotel' },
    // { label: 'Backup & Export',                 route: 'backup',                 icon: 'backup' },
    // { label: 'Integrationen',                   route: 'integrationen',          icon: 'extension' },
    // { label: 'Kreditkarte',                     route: 'kreditkarte',            icon: 'credit_card' },
    // { label: 'Sicherheit',                      route: 'sicherheit',             icon: 'security' },
  ];
}
