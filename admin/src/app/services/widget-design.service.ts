import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_WIDGET_DESIGN,
  TenantSettingsService,
  WidgetDesignSettings,
} from './tenant-settings.service';

@Injectable({ providedIn: 'root' })
export class WidgetDesignService {
  private readonly tenantSettings = inject(TenantSettingsService);

  private readonly _settings = signal<WidgetDesignSettings>({ ...DEFAULT_WIDGET_DESIGN });
  readonly settings = computed(() => this._settings());
  readonly isLoaded = signal<boolean>(false);

  constructor() {
    this.tenantSettings.load().subscribe(snapshot => {
      if (snapshot.widgetDesign) {
        this._settings.set({ ...DEFAULT_WIDGET_DESIGN, ...snapshot.widgetDesign });
      }
      this.isLoaded.set(true);
    });
  }

  save(patch: Partial<WidgetDesignSettings>): void {
    const next: WidgetDesignSettings = { ...this._settings(), ...patch };
    this._settings.set(next);
    // Zentralen Snapshot aus TenantSettingsService nutzen — immer aktuell.
    this.tenantSettings.save({ ...this.tenantSettings.snapshot, widgetDesign: next }).subscribe();
  }

  reset(): void {
    this.save({ ...DEFAULT_WIDGET_DESIGN });
  }
}
