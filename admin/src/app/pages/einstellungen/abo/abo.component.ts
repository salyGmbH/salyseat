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

  readonly saving = signal(false);
  readonly saved  = signal(false);

  readonly plans: PlanCard[] = [
    { key: 'tisch',  name: 'Tisch',  taglineKey: 'abo.plans.tisch.tagline',  color: '#64748b' },
    { key: 'menu',   name: 'Menü',   taglineKey: 'abo.plans.menu.tagline',   color: '#3b82f6' },
    { key: 'maitre', name: 'Maître', taglineKey: 'abo.plans.maitre.tagline', color: '#8b5cf6' },
  ];

  readonly features: PlanFeatureRow[] = [
    { labelKey: 'abo.features.reservations',    tisch: true,    menu: true,    maitre: true    },
    { labelKey: 'abo.features.dashboard',        tisch: true,    menu: true,    maitre: true    },
    { labelKey: 'abo.features.widget',           tisch: true,    menu: true,    maitre: true    },
    { labelKey: 'abo.features.guests',           tisch: true,    menu: true,    maitre: true    },
    { labelKey: 'abo.features.opening_hours',    tisch: true,    menu: true,    maitre: true    },
    { labelKey: 'abo.features.notes',            tisch: false,   menu: true,    maitre: true    },
    { labelKey: 'abo.features.menu_card',        tisch: false,   menu: true,    maitre: true    },
    { labelKey: 'abo.features.email_design',     tisch: false,   menu: true,    maitre: true    },
    { labelKey: 'abo.features.shift_plan',       tisch: false,   menu: false,   maitre: true    },
    { labelKey: 'abo.features.table_selection',  tisch: false,   menu: false,   maitre: true    },
    { labelKey: 'abo.features.phone_assistant',  tisch: 'addon', menu: 'addon', maitre: 'addon' },
    { labelKey: 'abo.features.vouchers',         tisch: 'addon', menu: 'addon', maitre: 'addon' },
    { labelKey: 'abo.features.pos',              tisch: 'addon', menu: 'addon', maitre: 'addon' },
  ];

  valueFor(row: PlanFeatureRow, plan: Plan): boolean | 'addon' | 'soon' {
    return row[plan];
  }

  isCurrentPlan(plan: Plan): boolean {
    return this.planService.currentPlan() === plan;
  }

  isUpgrade(plan: Plan): boolean {
    const rank: Record<Plan, number> = { tisch: 1, menu: 2, maitre: 3 };
    return rank[plan] > rank[this.planService.currentPlan()];
  }

  readonly addonSaving = signal<string | null>(null);

  toggleAddon(key: string): void {
    if (this.addonSaving()) return;
    const current = this.planService.hasAddon(key);
    this.addonSaving.set(key);

    this.http.patch<{ addons: string[] }>(
      `/api/v1/admin/tenant/settings/addon/${key}`,
      { active: !current },
    ).subscribe({
      next: () => {
        this.auth.refreshUser();
        this.addonSaving.set(null);
      },
      error: () => this.addonSaving.set(null),
    });
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
