import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { Plan } from './auth.types';

export type PlanFeature =
  | 'notizen'
  | 'speisekarte'
  | 'email-design'
  | 'schichtplan'
  | 'widget-tischauswahl'
  | 'telefonassistent';

const PLAN_RANK: Record<Plan, number> = {
  tisch:  1,
  menu:   2,
  maitre: 3,
};

const FEATURE_MIN_PLAN: Record<PlanFeature, Plan> = {
  'notizen':            'menu',
  'speisekarte':        'menu',
  'email-design':       'menu',
  'schichtplan':        'maitre',
  'widget-tischauswahl':'maitre',
  'telefonassistent':   'maitre',
};

@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly auth = inject(AuthService);

  readonly currentPlan = computed<Plan>(() => this.auth.user()?.plan ?? 'tisch');

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
    return this.auth.user()?.addons?.includes(key) ?? false;
  }
}
