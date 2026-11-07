import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_WIDGET_FUNCTIONAL,
  TenantSettingsService,
  WidgetFunctionalSettings,
} from './tenant-settings.service';

/** Verwaltet die funktionalen Widget-Einstellungen (Intervall, Räume, Pflichtfelder …). */
@Injectable({ providedIn: 'root' })
export class WidgetFunctionalService {
  private readonly tenantSettings = inject(TenantSettingsService);

  private readonly _settings = signal<WidgetFunctionalSettings>({ ...DEFAULT_WIDGET_FUNCTIONAL });
  readonly settings = computed(() => this._settings());
  readonly isLoaded = signal<boolean>(false);

  constructor() {
    this.tenantSettings.load().subscribe(snapshot => {
      if (snapshot.widgetFunctional) {
        this._settings.set({ ...DEFAULT_WIDGET_FUNCTIONAL, ...snapshot.widgetFunctional });
      }
      this.isLoaded.set(true);
    });
  }

  save(patch: Partial<WidgetFunctionalSettings>): void {
    const next: WidgetFunctionalSettings = { ...this._settings(), ...patch };
    this._settings.set(next);
    // Zentralen Snapshot aus TenantSettingsService nutzen — immer aktuell.
    this.tenantSettings.save({ ...this.tenantSettings.snapshot, widgetFunctional: next }).subscribe();
  }

  reset(): void {
    this.save({ ...DEFAULT_WIDGET_FUNCTIONAL });
  }
}
