import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { TenantsService, Tenant, PlatformStats } from '../../services/tenants.service';
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
  private readonly svc = inject(TenantsService);

  tenants        = signal<Tenant[]>([]);
  stats          = signal<PlatformStats | null>(null);
  search         = signal('');
  loading        = signal(true);
  selectedTenant = signal<Tenant | null>(null);
  showNeu        = signal(false);

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
  }

  planLabel(plan: string): string {
    return { tisch: 'Tisch', menu: 'Menü', maitre: 'Maître' }[plan] ?? plan;
  }

  planClass(plan: string): string {
    return { tisch: 'badge--tisch', menu: 'badge--menu', maitre: 'badge--maitre' }[plan] ?? '';
  }

  addonLabel(key: string): string {
    const map: Record<string, string> = {
      vouchers:    'Gutscheine',
      speisekarte: 'Speisekarte',
      pms:         'Hotel-PMS',
      pos:         'Kasse',
    };
    return map[key] ?? key;
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
