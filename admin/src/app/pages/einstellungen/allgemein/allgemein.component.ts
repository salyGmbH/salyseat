import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

import { ThemeMode, ThemeService } from '../../../services/theme.service';

type ModuleItem = {
  name: string;
  description: string;
  icon: string;
  active: boolean;
};

@Component({
  selector: 'app-allgemein',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    TranslateModule
  ],
  templateUrl: './allgemein.component.html',
  styleUrl: './allgemein.component.scss'
})
export class AllgemeinComponent {

  // =========================
  // THEME
  // =========================
  private readonly themeService = inject(ThemeService);

  readonly theme = this.themeService.mode;
  readonly effective = this.themeService.effective;

  themeInfo = signal(false);
  themeSaved = signal(false);

  // =========================
  // MODULE
  // =========================
  modules = signal<ModuleItem[]>([
    {
      name: 'Gutschein Modul',
      description: 'Rabatte & Gutscheincodes verwalten',
      icon: 'local_offer',
      active: true
    },
    {
      name: 'Raum Vermietung',
      description: 'Tische & Räume flexibel verwalten',
      icon: 'table_restaurant',
      active: true
    },
    {
      name: 'Ticket System',
      description: 'Support & Anfrage System',
      icon: 'confirmation_number',
      active: true
    },
    {
      name: 'Frühstücksliste',
      description: 'Morgenservice & Planung',
      icon: 'free_breakfast',
      active: false
    },
    {
      name: 'Schichtplan',
      description: 'Mitarbeiter & Schichtplanung',
      icon: 'schedule',
      active: true
    }
  ]);

  // =========================
  // ACTIONS
  // =========================
  setTheme(mode: ThemeMode): void {
    this.themeService.setMode(mode);
  }

  toggleThemeInfo(): void {
    this.themeInfo.update(v => !v);
  }

  toggleModule(index: number): void {
    this.modules.update(list => {
      const updated = [...list];
      updated[index] = {
        ...updated[index],
        active: !updated[index].active
      };
      return updated;
    });
  }

  saveTheme(): void {
    this.themeSaved.set(true);
    setTimeout(() => this.themeSaved.set(false), 2000);
  }
}