import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TenantSettingsService } from '../../../services/tenant-settings.service';

export type PackageCategory = 'menu' | 'event' | 'feier' | 'sonstiges';

export interface Package {
  id: string;
  name: string;
  description: string;
  category: PackageCategory;
  pricePerPerson: number;
  minPeople: number;
  maxPeople: number;
  durationHours: number | null;
  includes: string[];
  image?: string;
  active: boolean;
}

export interface CategoryMeta {
  key: PackageCategory;
  icon: string;
}

export const CATEGORY_META: Record<PackageCategory, CategoryMeta> = {
  menu:      { key: 'menu',      icon: 'restaurant_menu' },
  event:     { key: 'event',     icon: 'celebration'     },
  feier:     { key: 'feier',     icon: 'cake'            },
  sonstiges: { key: 'sonstiges', icon: 'local_offer'     },
};

@Component({
  selector: 'app-packages',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, TranslateModule],
  templateUrl: './packages.component.html',
  styleUrl: './packages.component.scss'
})
export class PackagesComponent implements OnInit {

  private readonly tenantSettings = inject(TenantSettingsService);
  private readonly translate      = inject(TranslateService);

  // ===================== CONFIG =====================
  readonly categories   = Object.values(CATEGORY_META);
  readonly categoryMeta = CATEGORY_META;

  // ===================== STATE =====================
  infoOpen  = false;
  modalOpen = false;
  saving    = false;
  saved     = false;
  error     = false;

  editingId: string | null = null;
  filter: PackageCategory | null = null;

  packages: Package[] = [];

  draft: Package = this.empty();
  newIncludeItem = '';

  // ===================== LIFECYCLE =====================
  ngOnInit(): void {
    this.tenantSettings.load().subscribe(s => {
      if (Array.isArray(s.packages) && s.packages.length) {
        this.packages = s.packages as Package[];
      }
    });
  }

  // ===================== DERIVED =====================
  get visiblePackages(): Package[] {
    if (!this.filter) return this.packages;
    return this.packages.filter(p => p.category === this.filter);
  }

  countByCategory(c: PackageCategory): number {
    return this.packages.filter(p => p.category === c).length;
  }

  // ===================== UI =====================
  toggleInfo(): void { this.infoOpen = !this.infoOpen; }
  setFilter(c: PackageCategory | null): void { this.filter = c; }

  // ===================== MODAL =====================
  openAdd(): void {
    this.draft = this.empty();
    this.editingId = null;
    this.newIncludeItem = '';
    this.modalOpen = true;
  }

  openEdit(pkg: Package): void {
    this.draft = { ...pkg, includes: [...pkg.includes] };
    this.editingId = pkg.id;
    this.newIncludeItem = '';
    this.modalOpen = true;
  }

  closeModal(): void { this.modalOpen = false; }

  // ===================== DRAFT MUTATIONS =====================
  setCategory(c: PackageCategory): void {
    this.draft = { ...this.draft, category: c };
  }

  addInclude(): void {
    const v = this.newIncludeItem.trim();
    if (!v) return;
    this.draft = { ...this.draft, includes: [...this.draft.includes, v] };
    this.newIncludeItem = '';
  }

  removeInclude(idx: number): void {
    this.draft = {
      ...this.draft,
      includes: this.draft.includes.filter((_, i) => i !== idx)
    };
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.draft = { ...this.draft, image: reader.result as string };
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  clearImage(): void {
    this.draft = { ...this.draft, image: '' };
  }

  // ===================== LIST ACTIONS =====================
  submitDraft(): void {
    if (!this.draft.name.trim()) return;
    if (this.draft.pricePerPerson < 0) return;
    if (this.draft.minPeople < 1) this.draft.minPeople = 1;
    if (this.draft.maxPeople < this.draft.minPeople) this.draft.maxPeople = this.draft.minPeople;

    if (this.editingId) {
      this.packages = this.packages.map(p =>
        p.id === this.editingId ? { ...this.draft, id: this.editingId! } : p
      );
    } else {
      this.packages = [
        ...this.packages,
        { ...this.draft, id: String(Date.now()) }
      ];
    }
    this.closeModal();
  }

  removePackage(pkg: Package): void {
    this.packages = this.packages.filter(p => p.id !== pkg.id);
  }

  toggleActive(pkg: Package): void {
    this.packages = this.packages.map(
      p => p.id === pkg.id ? { ...p, active: !p.active } : p
    );
  }

  duplicate(pkg: Package): void {
    this.packages = [
      ...this.packages,
      {
        ...pkg,
        id: String(Date.now()),
        name: pkg.name + this.translate.instant('packages.copy_suffix'),
        includes: [...pkg.includes],
        active: false,
      }
    ];
  }

  // ===================== SAVE =====================
  save(): void {
    this.saving = true;
    this.error  = false;
    const snapshot = this.tenantSettings.snapshot;
    this.tenantSettings.save({ ...snapshot, packages: this.packages }).subscribe({
      next: () => {
        this.saving = false;
        this.saved  = true;
        setTimeout(() => this.saved = false, 2000);
      },
      error: () => {
        this.saving = false;
        this.error  = true;
        setTimeout(() => this.error = false, 3000);
      },
    });
  }

  // ===================== HELPERS =====================
  trackById(_: number, p: Package): string { return p.id; }

  private empty(): Package {
    return {
      id: '',
      name: '',
      description: '',
      category: 'menu',
      pricePerPerson: 0,
      minPeople: 2,
      maxPeople: 8,
      durationHours: null,
      includes: [],
      image: '',
      active: true,
    };
  }
}
