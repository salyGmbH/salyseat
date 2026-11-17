import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { PlanFeature, PlanService } from '../../../services/plan.service';

interface SettingsItem {
  label: string;
  route: string;
  icon?: string;
  requiresFeature?: PlanFeature;
  addonKey?: string;
}

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, TranslateModule],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
})
export class OverviewComponent {
  readonly plan = inject(PlanService);

  isLocked(item: SettingsItem): boolean {
    if (item.requiresFeature) return !this.plan.can(item.requiresFeature);
    if (item.addonKey)        return !this.plan.hasAddon(item.addonKey);
    return false;
  }

  isAddonItem(item: SettingsItem): boolean {
    return !!item.addonKey;
  }

  minPlanLabel(item: SettingsItem): string {
    return item.requiresFeature ? this.plan.minPlanLabel(item.requiresFeature) : '';
  }

  rows(): number {
    return Math.ceil(this.items.length / 3);
  }

  items: SettingsItem[] = [
    { label: 'settings.abo',               route: 'abo',                    icon: 'workspace_premium' },  // Abo & Pakete
    { label: 'settings.general',           route: 'allgemein',              icon: 'tune' },               // Allgemeine Einstellungen
    { label: 'settings.notifications',     route: 'notifications',          icon: 'notifications_active' },// Benachrichtigungen
    { label: 'settings.permissions',       route: 'rechte',                 icon: 'admin_panel_settings' },// Berechtigungen
    { label: 'settings.emails',            route: 'emails',                 icon: 'mail',          requiresFeature: 'email-design' }, // E-Mails
    { label: 'settings.voucher_designer',  route: 'gutschein-designer',     icon: 'card_giftcard',  addonKey: 'vouchers' }, // Gutschein Designer
    { label: 'settings.customers',         route: 'kunden',                 icon: 'groups' },             // Kunden / Gäste
    { label: 'settings.login',             route: 'login',                  icon: 'login' },              // Login / Registrierung
    { label: 'settings.staff',             route: 'mitarbeiter',            icon: 'group' },              // Mitarbeiterverwaltung
    { label: 'settings.notes',             route: 'notizen',                icon: 'sticky_note_2',  requiresFeature: 'notizen' }, // Notizen
    { label: 'settings.opening_hours',     route: 'oeffnungszeiten',        icon: 'schedule' },           // Öffnungszeiten
    { label: 'settings.packages',          route: 'packages',               icon: 'inventory_2' },        // Packages
    { label: 'PMS Integration',            route: 'pms-anbindung',          icon: 'hotel',  addonKey: 'pms' }, // PMS Integration
    { label: 'settings.reservations',      route: 'reservierungen',         icon: 'event_available' },    // Reservierungen
    { label: 'settings.reservation_list',  route: 'reservierungsliste',     icon: 'list_alt' },           // Reservierungsliste
    { label: 'settings.menu',              route: 'speisekarte',            icon: 'menu_book',      addonKey: 'speisekarte' }, // Speisekarte
    { label: 'settings.languages',         route: 'sprachen',               icon: 'translate' },          // Sprachen
    { label: 'settings.status_labels',     route: 'status-kennzeichnungen', icon: 'flag' },               // Status, Hinweise & Gäste-Typen
    { label: 'settings.widget_settings',   route: 'widget-einstellungen',   icon: 'widgets' },            // Widget Einstellungen
    { label: 'settings.widget_designer',   route: 'widget',                 icon: 'palette' },            // Widget-Designer
    { label: 'settings.payments',          route: 'kreditkarte',            icon: 'credit_card' },        // Zahlungen & Stripe
  ];
}
