import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { jsPDF } from 'jspdf';
import { TenantSettingsService } from '../../../services/tenant-settings.service';
import { AllergenIconComponent } from '../../../shared/allergen-icon/allergen-icon.component';

// ── Typen ─────────────────────────────────────────────────────────────────────

export type Gericht = {
  id: string;
  name: string;
  description: string;
  price: string;
  zusatzstoffe: number[];
  allergene:    string[];
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
export class SpeisekarteComponent implements OnInit, OnDestroy {
  private readonly tenantSettings = inject(TenantSettingsService);

  // ── Design ─────────────────────────────────────────────────────────────────
  bgColor    = '#1a1a2e';
  bgImage:     string | null = null;
  textColor  = '#f5f5f5';
  accentColor = '#ff6b2c';
  fontFamilyKey = 'system';

  saved   = false;
  saving  = false;
  bgInfo  = false;

  /** Blob-URL der zuletzt generierten PDF — für den Download-Button. */
  pdfBlobUrl: string | null = null;

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

  get usedZusatzstoffe(): Zusatzstoff[] {
    const used = new Set<number>();
    this.sections.forEach(s => s.gerichte.forEach(g => g.zusatzstoffe.forEach(z => used.add(z))));
    return this.allZusatzstoffe.filter(z => used.has(z.id));
  }

  get usedAllergene(): AllergenDef[] {
    const used = new Set<string>();
    this.sections.forEach(s => s.gerichte.forEach(g => g.allergene.forEach(a => used.add(a))));
    return this.allergene.filter(a => used.has(a.key));
  }

  allergenByKey(key: string): AllergenDef | undefined {
    return this.allergene.find(a => a.key === key);
  }

  allergenLetters(keys: string[]): string {
    return keys
      .map(k => this.allergenByKey(k)?.letter ?? '?')
      .sort()
      .join(', ');
  }

  zusatzstoffLabel(ids: number[]): string {
    return [...ids].sort((a, b) => a - b).join(',');
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit() {
    this.tenantSettings.load().subscribe(settings => {
      // Allergenfarben aus den Tenant-Einstellungen
      if (settings.allergene?.length) {
        settings.allergene.forEach((sa: any) => {
          const local = this.allergene.find(a => a.key === sa.key);
          if (local && sa.color) local.color = sa.color;
        });
      }

      // Gespeicherte Speisekarte-Konfiguration laden
      if (settings.speisekarteKonfiguration) {
        const { design, sections } = settings.speisekarteKonfiguration;
        if (design) {
          if (design.bgColor)      this.bgColor      = design.bgColor;
          if (design.bgImage)      this.bgImage      = design.bgImage;
          if (design.textColor)    this.textColor    = design.textColor;
          if (design.accentColor)  this.accentColor  = design.accentColor;
          if (design.fontFamilyKey) this.fontFamilyKey = design.fontFamilyKey;
        }
        if (Array.isArray(sections) && sections.length > 0) {
          this.sections = sections;
        }
      }
    });
  }

  ngOnDestroy() {
    if (this.pdfBlobUrl) URL.revokeObjectURL(this.pdfBlobUrl);
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

  // ── Speichern & PDF ────────────────────────────────────────────────────────

  async save() {
    this.saving = true;

    // In DB speichern
    const konfiguration = {
      design: {
        bgColor:       this.bgColor,
        bgImage:       this.bgImage,
        textColor:     this.textColor,
        accentColor:   this.accentColor,
        fontFamilyKey: this.fontFamilyKey,
      },
      sections: this.sections,
    };

    await new Promise<void>(resolve => {
      this.tenantSettings
        .save({ ...this.tenantSettings.snapshot, speisekarteKonfiguration: konfiguration })
        .subscribe({ next: () => resolve(), error: () => resolve() });
    });

    // PDF generieren
    try {
      const blob = await this.buildPdf();
      if (this.pdfBlobUrl) URL.revokeObjectURL(this.pdfBlobUrl);
      this.pdfBlobUrl = URL.createObjectURL(blob);
    } catch (err) {
      console.error('PDF-Generierung fehlgeschlagen:', err);
    }

    this.saving = false;
    this.saved  = true;
    setTimeout(() => (this.saved = false), 2500);
  }

  downloadPdf() {
    if (!this.pdfBlobUrl) return;
    const a = document.createElement('a');
    a.href     = this.pdfBlobUrl;
    a.download = 'speisekarte.pdf';
    a.click();
  }

  // ── PDF-Generierung ────────────────────────────────────────────────────────

  private hexToRgb(hex: string): [number, number, number] {
    const c = hex.replace('#', '').padEnd(6, '0');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }

  private async buildPdf(): Promise<Blob> {
    const doc    = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const W      = 210;
    const H      = 297;
    const M      = 15;   // margin
    const CW     = W - M * 2;

    const bg     = this.hexToRgb(this.bgColor);
    const fg     = this.hexToRgb(this.textColor);
    const acc    = this.hexToRgb(this.accentColor);

    const font   = this.fontFamilyKey === 'serif' ? 'times'
                 : this.fontFamilyKey === 'mono'   ? 'courier'
                 : 'helvetica';

    const drawBg = () => {
      doc.setFillColor(...bg);
      doc.rect(0, 0, W, H, 'F');
      if (this.bgImage) {
        const fmt = this.bgImage.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        try { doc.addImage(this.bgImage, fmt, 0, 0, W, H); } catch {}
      }
    };

    drawBg();
    let y = M;

    const ensurePage = (need: number) => {
      if (y + need > H - M) {
        doc.addPage();
        drawBg();
        y = M;
      }
    };

    // ── Abschnitte ──────────────────────────────────────────────────────────
    for (const section of this.sections) {
      const validDishes = section.gerichte.filter((g: Gericht) => g.name.trim());
      if (!section.title && validDishes.length === 0) continue;

      ensurePage(20);

      // Abschnitts-Titel
      doc.setFont(font, 'bold');
      doc.setFontSize(15);
      doc.setTextColor(...acc);
      doc.text(section.title, M, y);
      y += 4;

      // Trennlinie
      doc.setDrawColor(...acc);
      doc.setLineWidth(0.4);
      doc.line(M, y, W - M, y);
      y += 6;

      // Gerichte
      for (const g of validDishes) {
        ensurePage(16);

        // Preis (rechts)
        const priceStr = g.price ? `${g.price} €` : '';
        doc.setFont(font, 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...acc);
        let rightEdge = W - M;
        if (priceStr) {
          doc.text(priceStr, rightEdge, y, { align: 'right' });
          rightEdge -= doc.getTextWidth(priceStr) + 3;
        }

        // Allergen-Buchstaben (links vom Preis, farbig)
        if (g.allergene?.length) {
          const sortedKeys = [...g.allergene].sort((a: string, b: string) => {
            const la = this.allergenByKey(a)?.letter ?? 'Z';
            const lb = this.allergenByKey(b)?.letter ?? 'Z';
            return la.localeCompare(lb);
          });

          doc.setFont(font, 'bold');
          doc.setFontSize(8);
          let bx = rightEdge;

          for (let i = sortedKeys.length - 1; i >= 0; i--) {
            const def = this.allergenByKey(sortedKeys[i]);
            if (!def) continue;
            const aRgb = this.hexToRgb(def.color);
            const lw   = doc.getTextWidth(def.letter);
            bx -= lw + 2;
            doc.setTextColor(...aRgb);
            doc.text(def.letter, bx, y);
          }
          rightEdge = bx - 2;
        }

        // Gericht-Name (+ Zusatzstoffe)
        const zusStr   = g.zusatzstoffe?.length ? ` (${this.zusatzstoffLabel(g.zusatzstoffe)})` : '';
        const nameStr  = g.name + zusStr;
        const maxNameW = Math.max(rightEdge - M - 2, 30);

        doc.setFont(font, 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...fg);
        const nameLines = doc.splitTextToSize(nameStr, maxNameW);
        doc.text(nameLines[0], M, y);
        y += 5;

        for (let i = 1; i < nameLines.length; i++) {
          ensurePage(5);
          doc.text(nameLines[i], M, y);
          y += 5;
        }

        // Beschreibung
        if (g.description?.trim()) {
          doc.setFont(font, 'normal');
          doc.setFontSize(9);
          doc.setTextColor(fg[0], fg[1], fg[2]);
          const descLines = doc.splitTextToSize(g.description, CW);
          ensurePage(descLines.length * 4);
          doc.text(descLines, M, y);
          y += descLines.length * 4 + 1;
        }

        y += 3;
      }

      y += 4;
    }

    // ── Fußnoten Zusatzstoffe ────────────────────────────────────────────────
    if (this.usedZusatzstoffe.length > 0) {
      ensurePage(8 + this.usedZusatzstoffe.length * 4);

      doc.setDrawColor(fg[0], fg[1], fg[2]);
      doc.setLineWidth(0.2);
      doc.line(M, y, W - M, y);
      y += 5;

      for (const z of this.usedZusatzstoffe) {
        ensurePage(5);
        doc.setFont(font, 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...acc);
        doc.text(`${z.id}`, M, y);

        doc.setFont(font, 'normal');
        doc.setTextColor(...fg);
        doc.text(`  ${z.label}`, M + 3, y);
        y += 4;
      }
      y += 4;
    }

    // ── Allergen-Legende ─────────────────────────────────────────────────────
    if (this.usedAllergene.length > 0) {
      ensurePage(8 + this.usedAllergene.length * 5);

      doc.setFont(font, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...fg);
      doc.text('Allergene', M, y);
      y += 5;

      for (const a of this.usedAllergene) {
        ensurePage(5);
        const aRgb = this.hexToRgb(a.color);

        // Farbiger Kreis
        doc.setFillColor(...aRgb);
        doc.circle(M + 2.5, y - 1.5, 2.5, 'F');
        doc.setFont(font, 'bold');
        doc.setFontSize(5.5);
        doc.setTextColor(255, 255, 255);
        doc.text(a.letter, M + 2.5, y - 0.6, { align: 'center' });

        // Label
        doc.setFont(font, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...fg);
        doc.text(`${a.letter} = ${a.label}`, M + 7, y);
        y += 5;
      }
    }

    return doc.output('blob');
  }
}
