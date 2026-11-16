import { Injectable, signal, effect, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface A11yOptions {
  textLarge:          boolean;
  highContrast:       boolean;
  invertColors:       boolean;
  monochrome:         boolean;
  lowSaturation:      boolean;
  highSaturation:     boolean;
  underlineLinks:     boolean;
  readableFont:       boolean;
  noAnimations:       boolean;
  highlightHeadings:  boolean;
  largeCursor:        boolean;
  readingGuide:       boolean;
  hideImages:         boolean;
}

const STORAGE_KEY = 'salyseat_a11y';

const DEFAULTS: A11yOptions = {
  textLarge:         false,
  highContrast:      false,
  invertColors:      false,
  monochrome:        false,
  lowSaturation:     false,
  highSaturation:    false,
  underlineLinks:    false,
  readableFont:      false,
  noAnimations:      false,
  highlightHeadings: false,
  largeCursor:       false,
  readingGuide:      false,
  hideImages:        false,
};

/** Maps each option key to a CSS class applied on <body> */
const CLASS_MAP: Record<keyof A11yOptions, string> = {
  textLarge:         'a11y-text-large',
  highContrast:      'a11y-high-contrast',
  invertColors:      'a11y-invert',
  monochrome:        'a11y-monochrome',
  lowSaturation:     'a11y-low-saturation',
  highSaturation:    'a11y-high-saturation',
  underlineLinks:    'a11y-underline-links',
  readableFont:      'a11y-readable-font',
  noAnimations:      'a11y-no-animations',
  highlightHeadings: 'a11y-highlight-headings',
  largeCursor:       'a11y-large-cursor',
  readingGuide:      'a11y-reading-guide',
  hideImages:        'a11y-hide-images',
};

@Injectable({ providedIn: 'root' })
export class AccessibilityService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser  = isPlatformBrowser(this.platformId);

  readonly options = signal<A11yOptions>(this._load());

  constructor() {
    // Apply CSS classes whenever options change
    effect(() => {
      const opts = this.options();
      this._applyClasses(opts);
      this._save(opts);
    });
  }

  toggle(key: keyof A11yOptions): void {
    this.options.update(o => ({ ...o, [key]: !o[key] }));
  }

  reset(): void {
    this.options.set({ ...DEFAULTS });
  }

  isActive(key: keyof A11yOptions): boolean {
    return this.options()[key];
  }

  get anyActive(): boolean {
    return Object.values(this.options()).some(Boolean);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _load(): A11yOptions {
    if (!this.isBrowser) return { ...DEFAULTS };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }

  private _save(opts: A11yOptions): void {
    if (!this.isBrowser) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(opts));
  }

  private _applyClasses(opts: A11yOptions): void {
    if (!this.isBrowser) return;
    const body = document.body;
    for (const [key, cls] of Object.entries(CLASS_MAP) as [keyof A11yOptions, string][]) {
      body.classList.toggle(cls, opts[key]);
    }
  }
}