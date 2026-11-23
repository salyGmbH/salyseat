import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { Plan } from './auth.types';

export type PlanFeature =
  | 'notizen'
  | 'speisekarte'
  | 'email-design'
  | 'schichtplan'
  | 'widget-tischauswahl'
  | 'telefonassistent'
  | 'statistiken'
  | 'bewertungen';

const PLAN_RANK: Record<Plan, number> = {
  tisch:  1,
  menu:   2,
  maitre: 3,
};

const FEATURE_MIN_PLAN: Record<PlanFeature, Plan> = {
  'notizen':            'menu',
  'speisekarte':        'menu',
  'email-design':       'maitre',
  'schichtplan':        'maitre',
  'widget-tischauswahl':'maitre',
  'telefonassistent':   'maitre',
  'statistiken':        'menu',
  'bewertungen':        'menu',
};

/** Vom Superadmin gepflegter Add-on-Katalog — siehe /api/v1/admin/addons. */
export interface AddonDefinition {
  key:               string;
  name:              string;
  description:       string | null;
  priceCents:        number | null;
  minPlan:           Plan | null;
  includedFromPlan:  Plan | null;
  icon:              string;
  status:            'active' | 'soon';
}

@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  readonly currentPlan = computed<Plan>(() => this.auth.user()?.plan ?? 'tisch');

  /** Preise in Cent pro Plan, geladen von /api/v1/admin/pricing. */
  readonly prices = signal<Record<Plan, number> | null>(null);

  /** Add-on-Katalog, geladen von /api/v1/admin/addons — Quelle für hasAddon()/canPurchaseAddon(). */
  readonly addons = signal<AddonDefinition[]>([]);

  loadPrices(): void {
    this.http.get<Record<Plan, number>>('/api/v1/admin/pricing').subscribe({
      next: p => this.prices.set(p),
      error: () => { /* Preise bleiben null — Anzeige blendet sie dann aus */ },
    });
  }

  loadAddons(): void {
    this.http.get<AddonDefinition[]>('/api/v1/admin/addons').subscribe({
      next: a => this.addons.set(a),
      error: () => { /* Katalog bleibt leer — Add-on-Grid zeigt dann nichts an */ },
    });
  }

  can(feature: PlanFeature): boolean {
    const rank = PLAN_RANK[this.currentPlan()];
    const required = PLAN_RANK[FEATURE_MIN_PLAN[feature]];
    return rank >= required;
  }

  readonly planLabel = computed(() => {
    const labels: Record<Plan, string> = { tisch: 'Tisch', menu: 'Menü', maitre: 'Maître' };
    return labels[this.currentPlan()];
  });

  minPlanLabel(feature: PlanFeature): string {
    const labels: Record<Plan, string> = { tisch: 'Tisch', menu: 'Menü', maitre: 'Maître' };
    return labels[FEATURE_MIN_PLAN[feature]];
  }

  hasAddon(key: string): boolean {
    if (this.auth.user()?.addons?.includes(key)) return true;
    // Manche Add-ons sind ab einem bestimmten Plan automatisch enthalten
    const def = this.addons().find(a => a.key === key);
    if (def?.includedFromPlan) {
      return PLAN_RANK[this.currentPlan()] >= PLAN_RANK[def.includedFromPlan];
    }
    return false;
  }

  /** Ob das aktuelle Abo hoch genug ist, um dieses Add-on überhaupt buchen zu können. */
  canPurchaseAddon(key: string): boolean {
    const min = this.addons().find(a => a.key === key)?.minPlan;
    if (!min) return true;
    return PLAN_RANK[this.currentPlan()] >= PLAN_RANK[min];
  }

  addonMinPlanLabel(key: string): string {
    const min = this.addons().find(a => a.key === key)?.minPlan;
    if (!min) return '';
    const labels: Record<Plan, string> = { tisch: 'Tisch', menu: 'Menü', maitre: 'Maître' };
    return labels[min];
  }

  /**
   * Plan-Label falls dieses Add-on ab einem bestimmten Plan automatisch enthalten ist
   * (statt separat gebucht werden zu müssen) — leer wenn es ein reines Add-on ohne
   * Plan-Bezug ist.
   */
  addonIncludedFromLabel(key: string): string {
    const from = this.addons().find(a => a.key === key)?.includedFromPlan;
    if (!from) return '';
    const labels: Record<Plan, string> = { tisch: 'Tisch', menu: 'Menü', maitre: 'Maître' };
    return labels[from];
  }
}
