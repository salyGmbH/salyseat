import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TenantSettingsService } from '../../../services/tenant-settings.service';
import { AllergenIconComponent } from '../../../shared/allergen-icon/allergen-icon.component';

// ── Typen ─────────────────────────────────────────────────────────────────────

export type Gericht = {
  id: string;
  name: string;
  description: string;
  price: string;
  zusatzstoffe: number[];  // e.g. [1, 4]
  allergene:    string[];  // e.g. ['gluten', 'milk']
};

export type MenuSection = {
  id: string;
  title: string;
  collapsed: boolean;
  gerichte: Gericht[];
};

export type Zusatzstoff = {
  id: number;
  label: string;
};

export type AllergenDef = {
  key:    string;
  label:  string;
  letter: string;
  color:  string;
};

// ── Komponente ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-speisekarte',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, AllergenIconComponent],
  templateUrl: './speisekarte.component.html',
  styleUrl: './speisekarte.component.scss',
})
export class SpeisekarteComponent implements OnInit {
  private readonly tenantSettings = inject(TenantSettingsService);

  // ── Design ─────────────────────────────────────────────────────────────────
  bgColor    = '#1a1a2e';
  bgImage:     string | null = null;
  textColor  = '#f5f5f5';
  accentColor = '#ff6b2c';
  fontFamilyKey = 'system';

  saved = false;
  bgInfo = false;

  // Dieselben Font-Optionen wie im Widget-Designer
  readonly fontFamilyOptions = [
    { key: 'system',  label: 'System (Standard)',  hint: 'Schlicht, neutral, gut lesbar.',           stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
    { key: 'modern',  label: 'Modern',             hint: 'Geometrisch &amp; freundlich.',             stack: '"Trebuchet MS", "Lucida Sans Unicode", "Lucida Grande", sans-serif' },
    { key: 'classic', label: 'Klassisch',          hint: 'Zeitlos &amp; sachlich.',                   stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
    { key: 'serif',   label: 'Serifen',            hint: 'Edel &amp; traditionell — passt zu Fine Dining.', stack: 'Georgia, "Times New Roman", Times, serif' },
    { key: 'rounded', label: 'Rund',               hint: 'Weich &amp; einladend — passt zu Cafés.',  stack: '"Avenir Next", "Avenir", "Nunito", sans-serif' },
    { key: 'mono',    label: 'Mono',               hint: 'Schreibmaschine — markant &amp; retro.',   stack: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace' },
  ];

  get currentFontStack(): string {
    return this.fontFamilyOptions.find(o => o.key === this.fontFamilyKey)?.stack
      ?? this.fontFamilyOptions[0].stack;
  }

  // ── Zusatzstoffe (EU-Deklarationspflicht, §9 LMIV) ────────────────────────
  readonly allZusatzstoffe: Zusatzstoff[] = [
    { id: 1,  label: 'mit Farbstoff' },
    { id: 2,  label: 'mit Konservierungsstoff' },
    { id: 3,  label: 'mit Antioxidationsmittel' },
    { id: 4,  label: 'mit Geschmacksverstärker' },
    { id: 5,  label: 'geschwefelt' },
    { id: 6,  label: 'geschwärzt' },
    { id: 7,  label: 'gewachst' },
    { id: 8,  label: 'mit Phosphat' },
    { id: 9,  label: 'mit Süßungsmittel(n)' },
    { id: 10, label: 'enthält eine Phenylalaninquelle' },
    { id: 11, label: 'koffeinhaltig' },
    { id: 12, label: 'chininhaltig' },
  ];

  // ── Allergene (EU Anhang II LMIV 1169/2011) ────────────────────────────────
  allergene: AllergenDef[] = [
    { key: 'gluten',      label: 'Gluten',                   letter: 'A', color: '#b45309' },
    { key: 'crustaceans', label: 'Krebstiere',               letter: 'B', color: '#f97316' },
    { key: 'eggs',        label: 'Eier',                     letter: 'C', color: '#facc15' },
    { key: 'fish',        label: 'Fisch',                    letter: 'D', color: '#0891b2' },
    { key: 'peanuts',     label: 'Erdnüsse',                 letter: 'E', color: '#d97706' },
    { key: 'soy',         label: 'Soja',                     letter: 'F', color: '#84cc16' },
    { key: 'milk',        label: 'Milch / Laktose',           letter: 'G', color: '#94a3b8' },
    { key: 'nuts',        label: 'Nüsse (Schalenfrüchte)',   letter: 'H', color: '#92400e' },
    { key: 'celery',      label: 'Sellerie',                 letter: 'I', color: '#65a30d' },
    { key: 'mustard',     label: 'Senf',                     letter: 'J', color: '#eab308' },
    { key: 'sesame',      label: 'Sesam',                    letter: 'K', color: '#c2a072' },
    { key: 'sulphites',   label: 'Schwefeldioxid / Sulfite', letter: 'L', color: '#a855f7' },
    { key: 'lupin',       label: 'Lupinen',                  letter: 'M', color: '#c084fc' },
    { key: 'molluscs',    label: 'Weichtiere',               letter: 'N', color: '#1e3a8a' },
  ];

  // ── Menü-Abschnitte ────────────────────────────────────────────────────────
  sections: MenuSection[] = [
    {
      id: crypto.randomUUID(),
      title: 'Vorspeisen',
      collapsed: false,
      gerichte: [
        {
          id: crypto.randomUUID(),
          name: 'Bruschetta al Pomodoro',
          description: 'Geröstetes Weißbrot mit Tomaten, Basilikum und Olivenöl.',
          price: '7,90',
          zusatzstoffe: [],
          allergene: ['gluten'],
        },
      ],
    },
    {
      id: crypto.randomUUID(),
      title: 'Hauptspeisen',
      collapsed: false,
      gerichte: [
        {
          id: crypto.randomUUID(),
          name: 'Pasta Bolognese',
          description: 'Spaghetti mit hausgemachter Fleischsauce und Parmesan.',
          price: '13,90',
          zusatzstoffe: [],
          allergene: ['gluten', 'milk', 'eggs'],
        },
      ],
    },
  ];

  // ── Computed ───────────────────────────────────────────────────────────────

  /** Alle im Menü tatsächlich verwendeten Zusatzstoffe (sortiert nach ID). */
  get usedZusatzstoffe(): Zusatzstoff[] {
    const used = new Set<number>();
    this.sections.forEach(s => s.gerichte.forEach(g => g.zusatzstoffe.forEach(z => used.add(z))));
    return this.allZusatzstoffe.filter(z => used.has(z.id));
  }

  /** Alle im Menü verwendeten Allergene (alphabetisch nach Buchstabe). */
  get usedAllergene(): AllergenDef[] {
    const used = new Set<string>();
    this.sections.forEach(s => s.gerichte.forEach(g => g.allergene.forEach(a => used.add(a))));
    return this.allergene.filter(a => used.has(a.key));
  }

  allergenByKey(key: string): AllergenDef | undefined {
    return this.allergene.find(a => a.key === key);
  }

  /** Gibt die Buchstaben der Allergene eines Gerichts als kommagetrennten String zurück. */
  allergenLetters(keys: string[]): string {
    return keys
      .map(k => this.allergenByKey(k)?.letter ?? '?')
      .sort()
      .join(', ');
  }

  /** Gibt die Zusatzstoff-IDs als formatierten Hochzahl-String zurück. */
  zusatzstoffLabel(ids: number[]): string {
    return [...ids].sort((a, b) => a - b).join(',');
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit() {
    // Allergenfarben aus den Tenant-Einstellungen laden (status-kennzeichnungen)
    this.tenantSettings.load().subscribe(settings => {
      if (settings.allergene?.length) {
        settings.allergene.forEach((sa: any) => {
          const local = this.allergene.find(a => a.key === sa.key);
          if (local && sa.color) local.color = sa.color;
        });
      }
    });
  }

  // ── Abschnitte ─────────────────────────────────────────────────────────────

  addSection() {
    this.sections.push({
      id: crypto.randomUUID(),
      title: 'Neuer Abschnitt',
      collapsed: false,
      gerichte: [],
    });
  }

  removeSection(id: string) {
    this.sections = this.sections.filter(s => s.id !== id);
  }

  toggleCollapse(id: string) {
    const s = this.sections.find(s => s.id === id);
    if (s) s.collapsed = !s.collapsed;
  }

  moveSectionUp(index: number) {
    if (index === 0) return;
    const copy = [...this.sections];
    [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
    this.sections = copy;
  }

  moveSectionDown(index: number) {
    if (index >= this.sections.length - 1) return;
    const copy = [...this.sections];
    [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]];
    this.sections = copy;
  }

  // ── Gerichte ───────────────────────────────────────────────────────────────

  addDish(section: MenuSection) {
    section.gerichte.push({
      id: crypto.randomUUID(),
      name: '',
      description: '',
      price: '',
      zusatzstoffe: [],
      allergene: [],
    });
  }

  removeDish(section: MenuSection, dishId: string) {
    section.gerichte = section.gerichte.filter(g => g.id !== dishId);
  }

  moveDishUp(section: MenuSection, index: number) {
    if (index === 0) return;
    const copy = [...section.gerichte];
    [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
    section.gerichte = copy;
  }

  moveDishDown(section: MenuSection, index: number) {
    if (index >= section.gerichte.length - 1) return;
    const copy = [...section.gerichte];
    [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]];
    section.gerichte = copy;
  }

  // ── Toggles ────────────────────────────────────────────────────────────────

  toggleZusatzstoff(gericht: Gericht, id: number) {
    const idx = gericht.zusatzstoffe.indexOf(id);
    if (idx === -1) gericht.zusatzstoffe.push(id);
    else gericht.zusatzstoffe.splice(idx, 1);
  }

  hasZusatzstoff(gericht: Gericht, id: number): boolean {
    return gericht.zusatzstoffe.includes(id);
  }

  toggleAllergen(gericht: Gericht, key: string) {
    const idx = gericht.allergene.indexOf(key);
    if (idx === -1) gericht.allergene.push(key);
    else gericht.allergene.splice(idx, 1);
  }

  hasAllergen(gericht: Gericht, key: string): boolean {
    return gericht.allergene.includes(key);
  }

  // ── Hintergrund-Bild ───────────────────────────────────────────────────────

  onBgImageUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => (this.bgImage = e.target?.result as string);
    reader.readAsDataURL(file);
  }

  removeBgImage() {
    this.bgImage = null;
  }

  // ── Speichern ──────────────────────────────────────────────────────────────

  save() {
    const payload = {
      design: {
        bgColor:       this.bgColor,
        bgImage:       this.bgImage ? '[base64]' : null,
        textColor:     this.textColor,
        accentColor:   this.accentColor,
        fontFamilyKey: this.fontFamilyKey,
        fontStack:     this.currentFontStack,
      },
      sections: this.sections,
    };
    console.log('Speisekarte gespeichert:', payload);
    this.saved = true;
    setTimeout(() => (this.saved = false), 2000);
  }
}