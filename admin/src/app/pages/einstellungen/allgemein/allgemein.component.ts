import { Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ThemeMode, ThemeService } from '../../../services/theme.service';

@Component({
  selector: 'app-allgemein',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './allgemein.component.html',
  styleUrl: './allgemein.component.scss'
})
export class AllgemeinComponent {
  private readonly themeService = inject(ThemeService);

  /** Vom User gewählter Modus: light | dark | system. */
  readonly theme     = this.themeService.mode;
  /** Was effektiv aktiv ist (bei „system" = aufgelöste OS-Einstellung). */
  readonly effective = this.themeService.effective;

  themeInfo  = signal(false);
  themeSaved = signal(false);

  setTheme(mode: ThemeMode): void {
    this.themeService.setMode(mode);
  }

  toggleThemeInfo(): void {
    this.themeInfo.update(v => !v);
  }

  saveTheme(): void {
    // ThemeService persistiert schon bei setMode — wir zeigen nur den Badge.
    this.themeSaved.set(true);
    setTimeout(() => this.themeSaved.set(false), 2000);
  }
}
