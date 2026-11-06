import { Injectable, computed, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dim' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dim' | 'dark';

const STORAGE_KEY = 'salyseat.theme.v1';
const DARK_BODY_CLASS = 'dark-theme';
const DIM_BODY_CLASS  = 'dim-theme';

/**
 * Zentrale Theme-Verwaltung.
 *
 * – Hält den vom User gewählten Modus (`light | dim | dark | system`) als Signal.
 * – Legt die passende Klasse (`dark-theme` oder `dim-theme`) aufs <body>,
 *   entfernt alles andere. Damit tauschen die CSS-Variablen in `styles.scss`
 *   alle Farben instant aus, ohne JS-Loop oder Neukompilierung.
 * – Im Modus `system` wird `prefers-color-scheme: dark` gehört und live
 *   auf OS-Änderungen reagiert. Der System-Modus löst sich in `light` oder
 *   `dark` auf — `dim` ist eine eigenständige User-Wahl.
 * – Persistiert die Auswahl in `localStorage`, überlebt Reloads.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _mode = signal<ThemeMode>(this.readStoredMode());
  readonly mode = computed(() => this._mode());

  /** Gibt zurück, was aktuell tatsächlich aktiv ist (berücksichtigt „system"). */
  readonly effective = computed<EffectiveTheme>(() => {
    const m = this._mode();
    if (m === 'dark')  return 'dark';
    if (m === 'dim')   return 'dim';
    if (m === 'light') return 'light';
    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  private mediaQuery?: MediaQueryList;
  private readonly mediaListener = () => this.apply();

  constructor() {
    this.registerSystemListener();
    this.apply();
  }

  /** Modus wechseln, direkt anwenden und persistieren. */
  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
    this.apply();
  }

  // ── Intern ───────────────────────────────────────────────────────────

  private readStoredMode(): ThemeMode {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'light' || v === 'dim' || v === 'dark' || v === 'system') return v;
    } catch { /* ignore */ }
    return 'system';
  }

  private systemPrefersDark(): boolean {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private apply(): void {
    const body = document.body;
    if (!body) return;
    const eff = this.effective();
    body.classList.toggle(DARK_BODY_CLASS, eff === 'dark');
    body.classList.toggle(DIM_BODY_CLASS,  eff === 'dim');
  }

  private registerSystemListener(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    // Moderner Listener; funktioniert in allen aktuellen Browsern
    this.mediaQuery.addEventListener('change', this.mediaListener);
  }
}

/**
 * Wendet den gespeicherten (oder System-)Modus SO FRÜH WIE MÖGLICH an,
 * noch bevor Angular hochgefahren ist — verhindert den kurzen
 * „Flash of Wrong Theme" beim Laden. Aus `main.ts` aufrufen.
 */
export function applyStoredThemeEarly(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const mode: ThemeMode =
      raw === 'light' || raw === 'dim' || raw === 'dark' || raw === 'system'
        ? raw
        : 'system';
    const prefersDark =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;

    const isDark = mode === 'dark' || (mode === 'system' && prefersDark);
    const isDim  = mode === 'dim';

    const apply = () => {
      document.body.classList.toggle(DARK_BODY_CLASS, isDark);
      document.body.classList.toggle(DIM_BODY_CLASS,  isDim);
    };

    if (typeof document !== 'undefined' && document.body) {
      apply();
    } else if (typeof document !== 'undefined') {
      document.addEventListener('DOMContentLoaded', apply);
    }
  } catch { /* ignore */ }
}
