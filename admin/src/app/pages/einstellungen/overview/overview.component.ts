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
    { label: 'settings.abo',               route: 'abo',                    icon: 'workspace_premium' },
    { label: 'settings.general',           route: 'allgemein',              icon: 'tune' },
    { label: 'settings.notifications',     route: 'notifications',          icon: 'notifications_active' },
    { label: 'settings.permissions',       route: 'rechte',                 icon: 'admin_panel_settings' },
    { label: 'settings.emails',            route: 'emails',                 icon: 'mail',          requiresFeature: 'email-design' },
    { label: 'settings.customers',         route: 'kunden',                 icon: 'groups' },
    { label: 'settings.login',             route: 'login',                  icon: 'login' },
    { label: 'settings.staff',             route: 'mitarbeiter',            icon: 'group' },
    { label: 'settings.notes',             route: 'notizen',                icon: 'sticky_note_2',  requiresFeature: 'notizen' },
    { label: 'settings.opening_hours',     route: 'oeffnungszeiten',        icon: 'schedule' },
    { label: 'settings.packages',          route: 'packages',               icon: 'inventory_2' },
    { label: 'settings.reservations',      route: 'reservierungen',         icon: 'event_available' },
    { label: 'settings.reservation_list',  route: 'reservierungsliste',     icon: 'list_alt' },
    { label: 'settings.languages',         route: 'sprachen',               icon: 'translate' },
    { label: 'settings.status_labels',     route: 'status-kennzeichnungen', icon: 'flag' },
    { label: 'settings.menu',              route: 'speisekarte',            icon: 'menu_book',      requiresFeature: 'speisekarte' },
    { label: 'settings.widget_designer',   route: 'widget',                 icon: 'palette' },
    { label: 'settings.widget_settings',   route: 'widget-einstellungen',   icon: 'widgets' },
    { label: 'settings.voucher_designer',  route: 'gutschein-designer',     icon: 'card_giftcard',  addonKey: 'vouchers' },
    { label: 'settings.payments',          route: 'kreditkarte',            icon: 'credit_card' },
  ];
}
