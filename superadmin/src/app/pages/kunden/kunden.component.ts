import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { TenantsService, Tenant, PlatformStats } from '../../services/tenants.service';
import { PricingService, PlanPrices } from '../../services/pricing.service';
import { AddonsService } from '../../services/addons.service';
import { KundeDetailComponent } from './detail/kunde-detail.component';
import { KundeNeuComponent } from './neu/kunde-neu.component';

@Component({
  selector: 'app-kunden',
  standalone: true,
  imports: [MatIconModule, FormsModule, UpperCasePipe, KundeDetailComponent, KundeNeuComponent],
  templateUrl: './kunden.component.html',
  styleUrl: './kunden.component.scss',
})
export class KundenComponent implements OnInit {
  private readonly svc       = inject(TenantsService);
  private readonly pricing   = inject(PricingService);
  private readonly addonsSvc = inject(AddonsService);

  tenants        = signal<Tenant[]>([]);
  stats          = signal<PlatformStats | null>(null);
  search         = signal('');
  loading        = signal(true);
  selectedTenant = signal<Tenant | null>(null);
  showNeu        = signal(false);

  prices          = signal<PlanPrices | null>(null);
  pricingModalOpen = signal(false);
  pricingSaving    = signal(false);
  pricingForm: PlanPrices = { tisch: 0, menu: 0, maitre: 0 };

  /** Add-on-Katalog, dynamisch geladen für addonLabel() — siehe /api/v1/superadmin/addons. */
  private readonly addonCatalog = signal<Record<string, string>>({});

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    return this.tenants().filter(t =>
      !q ||
      t.name.toLowerCase().includes(q) ||
      (t.adminEmail ?? '').toLowerCase().includes(q) ||
      t.slug.includes(q),
    );
  });

  ngOnInit(): void {
    this.svc.list().subscribe(t => { this.tenants.set(t); this.loading.set(false); });
    this.svc.stats().subscribe(s => this.stats.set(s));
    this.pricing.getPrices().subscribe(p => this.prices.set(p));
    this.addonsSvc.list().subscribe(list => {
      this.addonCatalog.set(Object.fromEntries(list.map(a => [a.key, a.name])));
    });
  }

  priceFor(plan: 'tisch' | 'menu' | 'maitre'): number | null {
    const p = this.prices();
    return p ? p[plan] : null;
  }

  /** Tatsächliche Endsumme pro Monat: bei monatlicher Vertragsdauer +10% Aufpreis, sonst der Grundpreis. */
  readonly MONTHLY_SURCHARGE = 1.10;

  finalPriceFor(t: Tenant): number | null {
    const base = this.priceFor(t.plan);
    if (base == null) return null;
    return t.contractDuration === 'monthly' ? Math.round(base * this.MONTHLY_SURCHARGE) : base;
  }

  formatPrice(cents: number | null): string {
    if (cents == null) return '';
    return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  openPricingModal(): void {
    const p = this.prices();
    this.pricingForm = {
      tisch:  (p?.tisch  ?? 0) / 100,
      menu:   (p?.menu   ?? 0) / 100,
      maitre: (p?.maitre ?? 0) / 100,
    };
    this.pricingModalOpen.set(true);
  }

  closePricingModal(): void {
    this.pricingModalOpen.set(false);
  }

  savePricing(): void {
    this.pricingSaving.set(true);
    const cents: PlanPrices = {
      tisch:  Math.round(this.pricingForm.tisch  * 100),
      menu:   Math.round(this.pricingForm.menu   * 100),
      maitre: Math.round(this.pricingForm.maitre * 100),
    };
    this.pricing.updatePrices(cents).subscribe({
      next: p => {
        this.prices.set(p);
        this.pricingSaving.set(false);
        this.pricingModalOpen.set(false);
      },
      error: () => { this.pricingSaving.set(false); },
    });
  }

  planLabel(plan: string): string {
    return { tisch: 'Tisch', menu: 'Menü', maitre: 'Maître' }[plan] ?? plan;
  }

  planClass(plan: string): string {
    return { tisch: 'badge--tisch', menu: 'badge--menu', maitre: 'badge--maitre' }[plan] ?? '';
  }

  addonLabel(key: string): string {
    return this.addonCatalog()[key] ?? key;
  }

  openDetail(t: Tenant): void {
    this.selectedTenant.set(t);
  }

  onDetailClosed(updated: Tenant | null): void {
    if (updated) {
      this.tenants.update(list => list.map(x => x.id === updated.id ? updated : x));
    }
    this.selectedTenant.set(null);
  }

  onNeuClosed(created: Tenant | null): void {
    if (created) {
      this.tenants.update(list => [created, ...list]);
      this.svc.stats().subscribe(s => this.stats.set(s));
    }
    this.showNeu.set(false);
  }

  toggleStatus(t: Tenant, event: Event): void {
    event.stopPropagation();
    this.svc.updateStatus(t.id, !t.active).subscribe(updated => {
      this.tenants.update(list => list.map(x => x.id === updated.id ? updated : x));
    });
  }
}
