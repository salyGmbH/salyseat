import { Injectable, computed, inject, signal } from '@angular/core';
import { FloorReservationStatus } from './floor-reservation.types';
import { STATUS_ICON_IDS, SUGGESTED_ICONS_BY_STATUS } from '../shared/status-icon/status-icon.component';
import { TenantSettingsService } from './tenant-settings.service';

export type StatusKey =
  | 'waiting'
  | 'active'
  | 'late'
  | 'paid'
  | 'completed'
  | 'no_show'
  | 'cancelled';

export interface StatusColor {
  key: StatusKey;
  label: string;
  color: string;
  icon?: string;
}

export type StatusViewMode = 'card' | 'text' | 'svg';

export const DEFAULT_STATUSES: StatusColor[] = [
  { key: 'waiting',   label: 'Warteliste', color: '#f59e0b', icon: 'circle' },
  { key: 'active',    label: 'Aktiv',      color: '#22c55e', icon: 'check' },
  { key: 'late',      label: 'Verspätet',  color: '#eab308', icon: 'clock' },
  { key: 'paid',      label: 'Bezahlt',    color: '#3b82f6', icon: 'money' },
  { key: 'completed', label: 'Beendet',    color: '#6b7280', icon: 'done' },
  { key: 'no_show',   label: 'No Show',    color: '#991b1b', icon: 'close' },
  { key: 'cancelled', label: 'Storniert',  color: '#9ca3af', icon: 'minus' },
];

const DEFAULT_VIEW_MODE: StatusViewMode = 'card';

const LIFECYCLE_TO_OPERATIONAL: Record<FloorReservationStatus, StatusKey> = {
  upcoming:   'waiting',
  seated:     'active',
  completed:  'completed',
  cancelled:  'cancelled',
  'no-show':  'no_show',
};

@Injectable({ providedIn: 'root' })
export class StatusColorsService {
  private readonly tenantSettings = inject(TenantSettingsService);

  // Starten mit Defaults; werden überschrieben sobald die API antwortet
  private readonly _statuses  = signal<StatusColor[]>(DEFAULT_STATUSES.map(s => ({ ...s })));
  private readonly _viewMode  = signal<StatusViewMode>(DEFAULT_VIEW_MODE);

  readonly statuses  = computed(() => this._statuses());
  readonly viewMode  = computed(() => this._viewMode());

  constructor() {
    this.tenantSettings.load().subscribe(settings => {
      if (settings.statuses?.length) {
        this._statuses.set(
          DEFAULT_STATUSES.map(def => {
            const saved = settings.statuses!.find(p => p.key === def.key);
            return saved ? { ...def, ...saved } : { ...def };
          })
        );
      }
      if (settings.statusView) {
        this._viewMode.set(settings.statusView);
      }
    });
  }

  colorFor(key: StatusKey): string {
    return this._statuses().find(s => s.key === key)?.color
        ?? DEFAULT_STATUSES.find(s => s.key === key)?.color
        ?? '#6b7280';
  }

  colorForReservation(status: FloorReservationStatus): string {
    return this.colorFor(LIFECYCLE_TO_OPERATIONAL[status]);
  }

  labelFor(key: StatusKey): string {
    return this._statuses().find(s => s.key === key)?.label
        ?? DEFAULT_STATUSES.find(s => s.key === key)?.label
        ?? key;
  }

  labelForReservation(status: FloorReservationStatus): string {
    return this.labelFor(LIFECYCLE_TO_OPERATIONAL[status]);
  }

  iconFor(key: StatusKey): string {
    const stored = this._statuses().find(s => s.key === key)?.icon ?? '';
    if ((STATUS_ICON_IDS as readonly string[]).includes(stored)) return stored;
    return SUGGESTED_ICONS_BY_STATUS[key]?.[0] ?? 'circle-dot';
  }

  iconForReservation(status: FloorReservationStatus): string {
    return this.iconFor(LIFECYCLE_TO_OPERATIONAL[status]);
  }

  /** Signale aktualisieren (wird von der Einstellungsseite nach dem API-Save aufgerufen). */
  setAll(list: StatusColor[]): void {
    this._statuses.set(list.map(s => ({ ...s })));
  }

  setViewMode(mode: StatusViewMode): void {
    this._viewMode.set(mode);
  }

  patch(key: StatusKey, patch: Partial<Pick<StatusColor, 'color' | 'label' | 'icon'>>): void {
    this._statuses.update(list => list.map(s => s.key === key ? { ...s, ...patch } : s));
  }

  /** Signale auf Defaults zurücksetzen (Persistierung übernimmt die Einstellungsseite). */
  reset(): void {
    this._statuses.set(DEFAULT_STATUSES.map(s => ({ ...s })));
    this._viewMode.set(DEFAULT_VIEW_MODE);
  }

  defaults(): StatusColor[] {
    return DEFAULT_STATUSES.map(s => ({ ...s }));
  }
}
