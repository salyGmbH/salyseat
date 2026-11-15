import { Component, computed, signal } from '@angular/core';
import { NgStyle } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

type FontFamilyKey = 'system' | 'modern' | 'classic' | 'serif' | 'rounded' | 'mono';
type FontSizeKey   = 'compact' | 'standard' | 'large';
type RadiusKey     = 'square' | 'soft' | 'pill';

interface FontFamilyOption { key: FontFamilyKey; label: string; stack: string; hint: string; }
interface FontSizeOption   { key: FontSizeKey;   label: string; basePx: number; hint: string; }
interface RadiusOption     { key: RadiusKey;      label: string; px: number; }

@Component({
  selector: 'app-gutschein-designer',
  standalone: true,
  imports: [NgStyle, FormsModule, MatIconModule],
  templateUrl: './gutschein-designer.component.html',
  styleUrl: './gutschein-designer.component.scss',
})
export class GutscheinDesignerComponent {

  // ── Texte ─────────────────────────────────────────────────────────────────
  readonly title    = signal<string>('Gutschein verschenken');
  readonly subtitle = signal<string>('Freude, die bleibt.');
  readonly btnLabel = signal<string>('Jetzt kaufen');

  // ── Typografie ────────────────────────────────────────────────────────────
  readonly fontFamilyOptions: FontFamilyOption[] = [
    { key: 'system',  label: 'System',    stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', hint: 'Neutral & vertraut' },
    { key: 'modern',  label: 'Modern',    stack: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif', hint: 'Klare Linien' },
    { key: 'classic', label: 'Classic',   stack: '"Helvetica Neue", Helvetica, Arial, sans-serif', hint: 'Zeitlos & sauber' },
    { key: 'serif',   label: 'Serif',     stack: 'Georgia, "Times New Roman", Times, serif', hint: 'Elegant & traditionell' },
    { key: 'rounded', label: 'Rounded',   stack: '"Avenir Next", "Avenir", "Nunito", sans-serif', hint: 'Warm & freundlich' },
    { key: 'mono',    label: 'Mono',      stack: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace', hint: 'Technisch & präzise' },
  ];

  readonly fontSizeOptions: FontSizeOption[] = [
    { key: 'compact',  label: 'Kompakt',   basePx: 12, hint: 'Platzsparend' },
    { key: 'standard', label: 'Standard',  basePx: 14, hint: 'Empfohlen' },
    { key: 'large',    label: 'Groß',      basePx: 16, hint: 'Gut lesbar' },
  ];

  readonly selectedFont     = signal<FontFamilyKey>('system');
  readonly selectedFontSize = signal<FontSizeKey>('standard');

  readonly currentFontStack = computed(() =>
    this.fontFamilyOptions.find(o => o.key === this.selectedFont())?.stack
    ?? this.fontFamilyOptions[0].stack);

  readonly currentBasePx = computed(() =>
    this.fontSizeOptions.find(o => o.key === this.selectedFontSize())?.basePx ?? 14);

  // ── Hintergrund ───────────────────────────────────────────────────────────
  /** 'color' = Farbwahl, 'image' = hochgeladenes Bild */
  readonly bgMode  = signal<'color' | 'image'>('color');
  readonly bgColor = signal<string>('#f4f5f7');
  readonly bgImage = signal<string | null>(null);

  readonly bgColorPresets: string[] = [
    '#f4f5f7', '#ffffff', '#fef9ef', '#fce7f3',
    '#0f172a', '#1e293b', '#1a1a2e', '#18181b',
  ];

  onBgImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.bgImage.set(reader.result as string);
      this.bgMode.set('image');
    };
    reader.readAsDataURL(file);
  }

  clearBgImage(): void {
    this.bgImage.set(null);
    this.bgMode.set('color');
  }

  // ── Farben ────────────────────────────────────────────────────────────────
  readonly colorPrimary = signal<string>('#2563eb');
  readonly colorText    = signal<string>('#1f2937');

  readonly primaryPresets: string[] = [
    '#2563eb', '#0f172a', '#0ea5e9', '#16a34a',
    '#f59e0b', '#dc2626', '#9333ea', '#db2777',
  ];
  readonly textPresets: string[] = [
    '#1f2937', '#000000', '#111827', '#374151',
    '#6b7280', '#ffffff', '#f9fafb', '#e5e7eb',
  ];

  // ── Button-Form ───────────────────────────────────────────────────────────
  readonly radiusOptions: RadiusOption[] = [
    { key: 'square', label: 'Eckig',  px: 4   },
    { key: 'soft',   label: 'Sanft',  px: 10  },
    { key: 'pill',   label: 'Pill',   px: 999 },
  ];
  readonly selectedRadius = signal<RadiusKey>('soft');

  readonly currentRadiusPx = computed(() =>
    this.radiusOptions.find(o => o.key === this.selectedRadius())?.px ?? 10);

  // ── Demo-Beträge für Vorschau ─────────────────────────────────────────────
  readonly previewAmounts = [25, 50, 100];
  readonly previewSelected = signal<number>(50);

  // ── Computed: Vorschau-Styles ─────────────────────────────────────────────
  readonly previewBg = computed<string>(() => {
    const mode = this.bgMode();
    if (mode === 'image' && this.bgImage()) {
      return `url(${this.bgImage()}) center/cover no-repeat`;
    }
    return this.bgColor();
  });

  readonly previewStyle = computed<Record<string, string>>(() => {
    const r = this.currentRadiusPx();
    return {
      '--gc-primary':    this.colorPrimary(),
      '--gc-text':       this.colorText(),
      '--gc-font':       this.currentFontStack(),
      '--gc-base':       `${this.currentBasePx()}px`,
      '--gc-radius':     `${Math.min(r, 16)}px`,
      '--gc-radius-btn': `${r}px`,
      'background':      this.previewBg(),
      'font-family':     this.currentFontStack(),
      'font-size':       `${this.currentBasePx()}px`,
    };
  });

  // ── Ist Hintergrund dunkel? (für Muted-Farbe in Vorschau) ────────────────
  readonly previewMuted = computed<string>(() => {
    const hex = this.bgColor().replace('#', '');
    if (hex.length !== 6) return '#6b7280';
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luma = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    return luma < 0.5 ? 'rgba(255,255,255,0.55)' : '#6b7280';
  });

  readonly previewSurface = computed<string>(() => {
    const hex = this.bgColor().replace('#', '');
    if (hex.length !== 6) return '#ffffff';
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luma = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    return luma < 0.5 ? 'rgba(255,255,255,0.07)' : '#ffffff';
  });

  // ── Speichern (nur Flash — kein Backend) ─────────────────────────────────
  readonly savedFlash = signal(false);

  save(): void {
    this.savedFlash.set(true);
    setTimeout(() => this.savedFlash.set(false), 1800);
  }

  reset(): void {
    this.title.set('Gutschein verschenken');
    this.subtitle.set('Freude, die bleibt.');
    this.btnLabel.set('Jetzt kaufen');
    this.selectedFont.set('system');
    this.selectedFontSize.set('standard');
    this.bgMode.set('color');
    this.bgColor.set('#f4f5f7');
    this.bgImage.set(null);
    this.colorPrimary.set('#2563eb');
    this.colorText.set('#1f2937');
    this.selectedRadius.set('soft');
    this.previewSelected.set(50);
  }
}