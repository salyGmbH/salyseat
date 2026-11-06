import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

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
  label: string;
  icon: string;
  tagline: string;
}

export const CATEGORY_META: Record<PackageCategory, CategoryMeta> = {
  menu:      { key: 'menu',      label: 'Menü',      icon: 'restaurant_menu', tagline: 'Mehrgang-Menüs' },
  event:     { key: 'event',     label: 'Event',     icon: 'celebration',     tagline: 'Besondere Abende' },
  feier:     { key: 'feier',     label: 'Feier',     icon: 'cake',            tagline: 'Geburtstag, Hochzeit, ...' },
  sonstiges: { key: 'sonstiges', label: 'Sonstiges', icon: 'local_offer',     tagline: 'Weitere Angebote' },
};

@Component({
  selector: 'app-packages',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './packages.component.html',
  styleUrl: './packages.component.scss'
})
export class PackagesComponent {

  // ===================== CONFIG =====================
  readonly categories = Object.values(CATEGORY_META);
  readonly categoryMeta = CATEGORY_META;

  // ===================== STATE =====================
  infoOpen  = false;
  modalOpen = false;
  saved     = false;

  /** Beim Bearbeiten gesetzt, sonst null = "Neu anlegen". */
  editingId: string | null = null;

  /** Filter-Kategorie; null = alle. */
  filter: PackageCategory | null = null;

  packages: Package[] = [
    {
      id: '1',
      name: 'Sommerabend-Menü',
      description: 'Vier Gänge mit saisonalen Zutaten aus der Region, inkl. Aperitif und Wein-Empfehlung vom Sommelier.',
      category: 'menu',
      pricePerPerson: 89,
      minPeople: 2,
      maxPeople: 12,
      durationHours: 2.5,
      includes: ['Aperitif', 'Vorspeise', 'Zwischengang', 'Hauptgang', 'Dessert', 'Wein-Empfehlung'],
      image: '',
      active: true,
    },
    {
      id: '2',
      name: 'Silvester-Gala',
      description: '6-Gänge-Galamenü mit Live-Musik, Mitternachts-Champagner und freier Sicht aufs Feuerwerk.',
      category: 'event',
      pricePerPerson: 195,
      minPeople: 2,
      maxPeople: 8,
      durationHours: 4,
      includes: ['Begrüßungssekt', '6-Gänge-Menü', 'Weinbegleitung', 'Live-Musik', 'Mitternachts-Champagner'],
      image: '',
      active: false,
    },
    {
      id: '3',
      name: 'Geburtstags-Feier',
      description: '3-Gänge-Menü mit Torte, Tischdeko und persönlicher Betreuung — auf Wunsch personalisiert.',
      category: 'feier',
      pricePerPerson: 65,
      minPeople: 6,
      maxPeople: 20,
      durationHours: 3,
      includes: ['Aperitif', '3-Gänge-Menü', 'Geburtstagstorte', 'Tischdekoration'],
      image: '',
      active: true,
    },
  ];

  /** Entwurf, der im Modal bearbeitet wird. */
  draft: Package = this.empty();
  newIncludeItem = '';

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
    input.value = ''; // erlaubt gleiche Datei erneut zu wählen
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
        name: pkg.name + ' (Kopie)',
        includes: [...pkg.includes],
        active: false,
      }
    ];
  }

  // ===================== SAVE =====================
  save(): void {
    this.saved = true;
    setTimeout(() => this.saved = false, 2000);
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
