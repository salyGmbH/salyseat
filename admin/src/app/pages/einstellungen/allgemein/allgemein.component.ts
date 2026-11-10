import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { HttpClient } from '@angular/common/http';

import { ThemeMode, ThemeService } from '../../../services/theme.service';
import { TenantSettingsService } from '../../../services/tenant-settings.service';

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
    TranslateModule,
  ],
  templateUrl: './allgemein.component.html',
  styleUrl: './allgemein.component.scss'
})
export class AllgemeinComponent implements OnInit {

  private readonly http           = inject(HttpClient);
  private readonly tenantSettings = inject(TenantSettingsService);

  // =========================
  // THEME
  // =========================
  private readonly themeService = inject(ThemeService);

  readonly theme     = this.themeService.mode;
  readonly effective = this.themeService.effective;

  themeInfo  = signal(false);
  themeSaved = signal(false);

  // =========================
  // LOGO
  // =========================
  logoLight         = signal<string | null>(null);
  logoDark          = signal<string | null>(null);
  logoLightUploading = signal(false);
  logoDarkUploading  = signal(false);
  logoLightError     = signal<string | null>(null);
  logoDarkError      = signal<string | null>(null);
  logoSaved          = signal(false);

  ngOnInit(): void {
    this.tenantSettings.load().subscribe(s => {
      this.logoLight.set(s.logoLight ?? null);
      this.logoDark.set(s.logoDark ?? null);
    });
  }

  onLogoSelected(event: Event, variant: 'light' | 'dark'): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      if (variant === 'light') this.logoLightError.set('Datei darf max. 5 MB groß sein.');
      else                     this.logoDarkError.set('Datei darf max. 5 MB groß sein.');
      input.value = '';
      return;
    }

    if (variant === 'light') { this.logoLightUploading.set(true); this.logoLightError.set(null); }
    else                     { this.logoDarkUploading.set(true);  this.logoDarkError.set(null); }

    const body = new FormData();
    body.append('image', file);

    this.http.post<{ url: string }>('/api/v1/admin/upload/image', body).subscribe({
      next: res => {
        if (variant === 'light') { this.logoLight.set(res.url); this.logoLightUploading.set(false); }
        else                     { this.logoDark.set(res.url);  this.logoDarkUploading.set(false); }
        this.saveLogos();
      },
      error: err => {
        const msg = err?.error?.error ?? 'Upload fehlgeschlagen.';
        if (variant === 'light') { this.logoLightError.set(msg); this.logoLightUploading.set(false); }
        else                     { this.logoDarkError.set(msg);  this.logoDarkUploading.set(false); }
      },
    });

    input.value = '';
  }

  removeLogo(variant: 'light' | 'dark'): void {
    if (variant === 'light') this.logoLight.set(null);
    else                     this.logoDark.set(null);
    this.saveLogos();
  }

  private saveLogos(): void {
    const current = this.tenantSettings.snapshot ?? {};
    this.tenantSettings.save({ ...current, logoLight: this.logoLight(), logoDark: this.logoDark() })
      .subscribe({
        next: () => {
          this.logoSaved.set(true);
          setTimeout(() => this.logoSaved.set(false), 3000);
        },
      });
  }

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
