import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { PlanService } from '../../../services/plan.service';
import { AuthService } from '../../../services/auth.service';
import { Plan } from '../../../services/auth.types';

interface PlanFeatureRow {
  labelKey: string;
  tisch:  boolean | 'addon' | 'soon';
  menu:   boolean | 'addon' | 'soon';
  maitre: boolean | 'addon' | 'soon';
  /** Kurze Highlight-Unterpunkte (i18n-Keys), nur für besonders verkaufsstarke Zeilen. */
  subKeys?: string[];
}

interface PlanCard {
  key: Plan;
  name: string;
  taglineKey: string;
  color: string;
}

@Component({
  selector: 'app-abo',
  standalone: true,
  imports: [MatIconModule, TranslateModule],
  templateUrl: './abo.component.html',
  styleUrl: './abo.component.scss',
})
export class AboComponent {
  readonly planService = inject(PlanService);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  readonly saving      = signal(false);
  readonly saved       = signal(false);
  readonly infoOpen    = signal(false);
  readonly infoAddons  = signal(false);

  /** Anzeige-Umschalter Preise: jährliche Zahlung (Basispreis) vs. monatliche Zahlung (+10%). */
  readonly MONTHLY_SURCHARGE = 1.10;
  readonly billingPeriod = signal<'yearly' | 'monthly'>('yearly');

  toggleBillingPeriod(): void {
    this.billingPeriod.set(this.billingPeriod() === 'yearly' ? 'monthly' : 'yearly');
  }

  /** Preis in Cent für die aktuell gewählte Zahlweise (jährlich = Basispreis, monatlich = Basispreis +10%). */
  displayPrice(plan: Plan): number | null {
    const base = this.planService.prices()?.[plan];
    if (base == null) return null;
    return this.billingPeriod() === 'monthly' ? Math.round(base * this.MONTHLY_SURCHARGE) : base;
  }

  constructor() {
    this.planService.loadPrices();
    this.planService.loadAddons();
  }

  formatPrice(cents: number | undefined | null): string {
    if (cents == null) return '';
    return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  readonly plans: PlanCard[] = [
    { key: 'tisch',  name: 'Tisch',  taglineKey: 'abo.plans.tisch.tagline',  color: '#64748b' },
    { key: 'menu',   name: 'Menü',   taglineKey: 'abo.plans.menu.tagline',   color: '#3b82f6' },
    { key: 'maitre', name: 'Maître', taglineKey: 'abo.plans.maitre.tagline', color: '#8b5cf6' },
  ];

  readonly features: PlanFeatureRow[] = [
    { labelKey: 'abo.features.reservations',    tisch: true,    menu: true,    maitre: true,
      subKeys: [
        'abo.features.reservations_sub_dragdrop',
        'abo.features.reservations_sub_timeline',
        'abo.features.reservations_sub_autostatus',
      ] },
    { labelKey: 'abo.features.dashboard',        tisch: true,    menu: true,    maitre: true    },
    { labelKey: 'abo.features.widget',           tisch: true,    menu: true,    maitre: true,
      subKeys: [
        'abo.features.widget_sub_layouts',
        'abo.features.widget_sub_preview',
        'abo.features.widget_sub_branding',
        'abo.features.widget_sub_embed',
      ] },
    { labelKey: 'abo.features.calendar_sync',    tisch: true,    menu: true,    maitre: true,
      subKeys: [
        'abo.features.calendar_sync_sub_providers',
        'abo.features.calendar_sync_sub_live',
        'abo.features.calendar_sync_sub_export',
      ] },
    { labelKey: 'abo.features.guests',           tisch: true,    menu: true,    maitre: true,
      subKeys: [
        'abo.features.guests_sub_vip',
        'abo.features.guests_sub_regulars',
        'abo.features.guests_sub_birthday',
        'abo.features.guests_sub_noshow',
      ] },
    { labelKey: 'abo.features.staff',            tisch: true,    menu: true,    maitre: true,
      subKeys: [
        'abo.features.staff_sub_roles',
        'abo.features.staff_sub_id',
        'abo.features.staff_sub_active',
      ] },
    { labelKey: 'abo.features.permissions',      tisch: true,    menu: true,    maitre: true,
      subKeys: [
        'abo.features.permissions_sub_matrix',
        'abo.features.permissions_sub_roles',
        'abo.features.permissions_sub_reset',
      ] },
    { labelKey: 'abo.features.statistics',       tisch: false,   menu: true,    maitre: true,
      subKeys: [
        'abo.features.statistics_sub_utilization',
        'abo.features.statistics_sub_guesttypes',
        'abo.features.statistics_sub_reliability',
      ] },
    { labelKey: 'abo.features.notes',            tisch: false,   menu: true,    maitre: true,
      subKeys: [
        'abo.features.notes_sub_calendar',
        'abo.features.notes_sub_colors',
        'abo.features.notes_sub_float',
      ] },
    { labelKey: 'abo.features.reviews',          tisch: false,   menu: true,    maitre: true,
      subKeys: [
        'abo.features.reviews_sub_auto',
        'abo.features.reviews_sub_categories',
        'abo.features.reviews_sub_private',
      ] },
    { labelKey: 'abo.features.email_design',     tisch: false,   menu: false,   maitre: true,
      subKeys: [
        'abo.features.email_design_sub_preview',
        'abo.features.email_design_sub_branding',
        'abo.features.email_design_sub_types',
      ] },
    { labelKey: 'abo.features.shift_plan',       tisch: 'addon', menu: 'addon', maitre: true,
      subKeys: [
        'abo.features.shift_plan_sub_templates',
        'abo.features.shift_plan_sub_swap',
        'abo.features.shift_plan_sub_warning',
        'abo.features.shift_plan_sub_timeclock',
      ] },
    { labelKey: 'abo.features.table_selection',  tisch: false,   menu: false,   maitre: true,
      subKeys: [
        'abo.features.table_selection_sub_live',
        'abo.features.table_selection_sub_filter',
        'abo.features.table_selection_sub_auto',
      ] },
    { labelKey: 'abo.features.phone_assistant',  tisch: 'addon', menu: 'addon', maitre: 'addon' },
    { labelKey: 'abo.features.vouchers',         tisch: 'addon', menu: 'addon', maitre: 'addon' },
    { labelKey: 'abo.features.menu_card',        tisch: 'addon', menu: true,    maitre: true,
      subKeys: [
        'abo.features.menu_card_sub_allergens',
        'abo.features.menu_card_sub_pdf',
        'abo.features.menu_card_sub_design',
        'abo.features.menu_card_sub_qr',
      ] },
    { labelKey: 'abo.features.pos',              tisch: 'addon', menu: 'addon', maitre: 'addon' },
    { labelKey: 'abo.features.packages',         tisch: 'addon', menu: true,    maitre: true,
      subKeys: [
        'abo.features.packages_sub_perperson',
        'abo.features.packages_sub_categories',
        'abo.features.packages_sub_media',
        'abo.features.packages_sub_widget',
      ] },
    { labelKey: 'abo.features.whatsapp',         tisch: 'addon', menu: 'addon', maitre: 'addon',
      subKeys: [
        'abo.features.whatsapp_sub_dialog',
        'abo.features.whatsapp_sub_capacity',
        'abo.features.whatsapp_sub_autoconfirm',
      ] },
  ];

  valueFor(row: PlanFeatureRow, plan: Plan): boolean | 'addon' | 'soon' {
    return row[plan];
  }

  private readonly openFeatureKeys = signal<Set<string>>(new Set());

  isFeatureOpen(row: PlanFeatureRow, plan: Plan): boolean {
    return this.openFeatureKeys().has(`${plan}:${row.labelKey}`);
  }

  toggleFeature(row: PlanFeatureRow, plan: Plan): void {
    const key = `${plan}:${row.labelKey}`;
    const next = new Set(this.openFeatureKeys());
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.openFeatureKeys.set(next);
  }

  isCurrentPlan(plan: Plan): boolean {
    return this.planService.currentPlan() === plan;
  }

  isUpgrade(plan: Plan): boolean {
    const rank: Record<Plan, number> = { tisch: 1, menu: 2, maitre: 3 };
    return rank[plan] > rank[this.planService.currentPlan()];
  }

  selectPlan(plan: Plan): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.saved.set(false);

    this.http.patch<{ plan: Plan }>('/api/v1/admin/tenant/settings/plan', { plan }).subscribe({
      next: () => {
        this.auth.refreshUser();
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: () => {
        this.saving.set(false);
      },
    });
  }
}
