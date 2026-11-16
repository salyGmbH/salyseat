import { Component, inject, signal, HostListener, PLATFORM_ID, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { AccessibilityService, A11yOptions } from '../../services/accessibility.service';

interface A11yOption {
  key:   keyof A11yOptions;
  label: string;
  icon:  string; // inline SVG path or emoji fallback — we use SVG strings
  svgId: string;
}

@Component({
  selector: 'wdg-a11y-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './a11y-widget.component.html',
  styleUrl:    './a11y-widget.component.scss',
})
export class A11yWidgetComponent implements AfterViewChecked {
  readonly a11y       = inject(AccessibilityService);
  private platformId  = inject(PLATFORM_ID);
  private isBrowser   = isPlatformBrowser(this.platformId);
  private elRef       = inject(ElementRef);

  panelOpen = signal(false);
  private _focusPanelOnNextCheck = false;

  readonly options: A11yOption[] = [
    { key: 'textLarge',         label: 'Text vergrößern',        svgId: 'text-large',    icon: '' },
    { key: 'highContrast',      label: 'Hochkontrastmodus',      svgId: 'contrast',      icon: '' },
    { key: 'invertColors',      label: 'Farben invertieren',     svgId: 'invert',        icon: '' },
    { key: 'monochrome',        label: 'Monochrom',              svgId: 'monochrome',    icon: '' },
    { key: 'lowSaturation',     label: 'Niedrige Sättigung',     svgId: 'low-sat',       icon: '' },
    { key: 'highSaturation',    label: 'Hohe Sättigung',         svgId: 'high-sat',      icon: '' },
    { key: 'underlineLinks',    label: 'Links unterstreichen',   svgId: 'underline',     icon: '' },
    { key: 'readableFont',      label: 'Lesbare Schrift',        svgId: 'font',          icon: '' },
    { key: 'noAnimations',      label: 'Animationen stoppen',    svgId: 'no-anim',       icon: '' },
    { key: 'highlightHeadings', label: 'Überschriften hervorh.', svgId: 'headings',      icon: '' },
    { key: 'largeCursor',       label: 'Großer Cursor',          svgId: 'cursor',        icon: '' },
    { key: 'readingGuide',      label: 'Leseführung',            svgId: 'reading',       icon: '' },
    { key: 'hideImages',        label: 'Bilder ausblenden',      svgId: 'hide-img',      icon: '' },
  ];

  ngAfterViewChecked(): void {
    if (this._focusPanelOnNextCheck && this.isBrowser) {
      this._focusPanelOnNextCheck = false;
      const panel = this.elRef.nativeElement.querySelector('.a11y-panel') as HTMLElement | null;
      if (panel) {
        const first = panel.querySelector<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])'
        );
        first?.focus();
      }
    }
  }

  togglePanel(): void {
    this.panelOpen.update(v => !v);
    if (this.panelOpen()) {
      this._focusPanelOnNextCheck = true;
    } else {
      // Fokus zurück auf Trigger-Button
      const trigger = this.elRef.nativeElement.querySelector('.a11y-trigger') as HTMLElement;
      trigger?.focus();
    }
  }

  closePanel(): void {
    this.panelOpen.set(false);
    const trigger = this.elRef.nativeElement.querySelector('.a11y-trigger') as HTMLElement;
    trigger?.focus();
  }

  /** Focus-Trap: Tab / Shift+Tab bleibt im Panel */
  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (!this.panelOpen() || e.key !== 'Tab') return;
    const panel = this.elRef.nativeElement.querySelector('.a11y-panel') as HTMLElement | null;
    if (!panel) return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'
    ));
    if (!focusable.length) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  toggle(key: keyof A11yOptions): void {
    this.a11y.toggle(key);
  }

  reset(): void {
    this.a11y.reset();
  }

  isActive(key: keyof A11yOptions): boolean {
    return this.a11y.isActive(key);
  }

  get anyActive(): boolean {
    return this.a11y.anyActive;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closePanel();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (!this.isBrowser || !this.a11y.isActive('readingGuide')) return;
    const el = document.getElementById('a11y-reading-line');
    if (el) el.style.top = `${e.clientY - 16}px`;
  }
}