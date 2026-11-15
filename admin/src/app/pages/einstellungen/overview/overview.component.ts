import { Component, computed, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription, merge } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { TenantPlan } from '../../../services/auth.types';

interface SettingsItem {
  label: string;
  route: string;
  icon?: string;
  /** Welche Pläne haben Zugriff auf dieses Item (leer = alle) */
  plans?: TenantPlan[];
}

// Planrangfolge: je höher der Index, desto mehr Features
const PLAN_RANK: Record<TenantPlan, number> = {
  trial:        0,
  starter:      1,
  professional: 2,
  enterprise:   3,
};

/** Gibt true zurück wenn der Tenant-Plan ausreicht */
function planAllowed(itemPlans: TenantPlan[] | undefined, tenantPlan: TenantPlan): boolean {
  if (!itemPlans || itemPlans.length === 0) return true; // kein Plan-Lock
  return itemPlans.some(p => PLAN_RANK[tenantPlan] >= PLAN_RANK[p]);
}

const RAW_ITEMS: SettingsItem[] = [
  // ── Basis (alle Pläne) ────────────────────────────────────────────────────
  { label: 'settings.general',          route: 'allgemein',              icon: 'tune' },
  { label: 'settings.notifications',    route: 'notifications',          icon: 'notifications_active' },
  { label: 'settings.permissions',      route: 'rechte',                 icon: 'admin_panel_settings' },
  { label: 'settings.emails',           route: 'emails',                 icon: 'mail' },
  { label: 'settings.customers',        route: 'kunden',                 icon: 'groups' },
  { label: 'settings.login',            route: 'login',                  icon: 'login' },
  { label: 'settings.staff',            route: 'mitarbeiter',            icon: 'group' },
  { label: 'settings.opening_hours',    route: 'oeffnungszeiten',        icon: 'schedule' },
  { label: 'settings.reservations',     route: 'reservierungen',         icon: 'event_available' },
  { label: 'settings.reservation_list', route: 'reservierungsliste',     icon: 'list_alt' },
  { label: 'settings.languages',        route: 'sprachen',               icon: 'translate' },
  { label: 'settings.status_labels',    route: 'status-kennzeichnungen', icon: 'flag' },

  // ── Starter+ ──────────────────────────────────────────────────────────────
  { label: 'settings.notes',            route: 'notizen',                icon: 'sticky_note_2',       plans: ['starter', 'professional', 'enterprise'] },
  { label: 'settings.menu',             route: 'speisekarte',            icon: 'menu_book',            plans: ['starter', 'professional', 'enterprise'] },
  { label: 'settings.packages',         route: 'packages',               icon: 'inventory_2',          plans: ['starter', 'professional', 'enterprise'] },

  // ── Professional+ ─────────────────────────────────────────────────────────
  { label: 'settings.widget_designer',  route: 'widget',                 icon: 'palette',              plans: ['professional', 'enterprise'] },
  { label: 'settings.widget_settings',  route: 'widget-einstellungen',   icon: 'widgets',              plans: ['professional', 'enterprise'] },
  { label: 'settings.voucher_designer', route: 'gutschein-designer',     icon: 'card_giftcard',        plans: ['professional', 'enterprise'] },
  { label: 'settings.payments',         route: 'kreditkarte',            icon: 'credit_card',          plans: ['professional', 'enterprise'] },
];

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, TranslateModule],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
})
export class OverviewComponent implements OnInit, OnDestroy {
  private readonly translate = inject(TranslateService);
  private readonly auth      = inject(AuthService);
  private langSub?: Subscription;

  private readonly _langVersion = signal(0);

  /** Gefilterte + sortierte Items für den aktuellen Plan */
  readonly items = computed(() => {
    this._langVersion();
    const plan        = this.auth.plan();
    const isSuperAdmin = this.auth.user()?.roles.includes('ROLE_SUPER_ADMIN') ?? false;
    return [...RAW_ITEMS]
      .filter(item => isSuperAdmin || planAllowed(item.plans, plan))
      .sort((a, b) =>
        this.translate.instant(a.label).localeCompare(
          this.translate.instant(b.label),
          this.translate.currentLang,
          { sensitivity: 'base' },
        )
      );
  });

  /** Zeilen = ⌈items / 3⌉ — passt sich automatisch an */
  readonly rows = computed(() => Math.ceil(this.items().length / 3));

  ngOnInit(): void {
    this.langSub = merge(
      this.translate.onLangChange,
      this.translate.onTranslationChange,
    ).subscribe(() => this._langVersion.update(v => v + 1));
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
  }
}
