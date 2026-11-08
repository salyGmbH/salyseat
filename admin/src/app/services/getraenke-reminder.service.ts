import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';
import { TenantSettingsService } from './tenant-settings.service';

export interface GetraenkeSettings {
  enabled: boolean;
  minutes: number;
}

const DEFAULTS: GetraenkeSettings = { enabled: false, minutes: 20 };

@Injectable({ providedIn: 'root' })
export class GetraenkeReminderService implements OnDestroy {
  private readonly tenantSettings = inject(TenantSettingsService);

  // ── Einstellungen ─────────────────────────────────────────────────────────
  private _settings = signal<GetraenkeSettings>(DEFAULTS);

  enabled = computed(() => this._settings().enabled);
  minutes = computed(() => this._settings().minutes);

  // ── Aktive Alerts: Reservation-IDs, bei denen das Icon leuchten soll ─────
  readonly activeAlerts = signal<Set<string>>(new Set());
  readonly hasAnyAlert  = computed(() => this.activeAlerts().size > 0);

  // Laufende Timer: reservationId → setTimeout-Handle
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    // Einstellungen beim Start vom Backend laden
    this.tenantSettings.load().subscribe(settings => {
      if (settings.getraenkeReminder) {
        this._settings.set(settings.getraenkeReminder);
      }
    });
  }

  // ── Settings speichern ────────────────────────────────────────────────────
  saveSettings(s: GetraenkeSettings): void {
    this._settings.set(s);
    const updated = { ...this.tenantSettings.snapshot, getraenkeReminder: s };
    this.tenantSettings.save(updated).subscribe({
      error: () => console.warn('Getränke-Reminder-Sync fehlgeschlagen'),
    });
  }

  // ── Timer starten (beim Einchecken aufrufen) ──────────────────────────────
  startTimer(reservationId: string): void {
    if (!this.enabled()) return;
    if (this.timers.has(reservationId)) return;
    this._scheduleNext(reservationId);
  }

  // ── Alert bestätigen — Icon verschwindet, Timer startet neu ──────────────
  acknowledgeAlert(reservationId: string): void {
    this.activeAlerts.update(set => {
      const next = new Set(set);
      next.delete(reservationId);
      return next;
    });
    if (!this.timers.has(reservationId) && this.enabled()) {
      this._scheduleNext(reservationId);
    }
  }

  // ── Timer stoppen (beim Auschecken / Stornieren) ──────────────────────────
  cancelTimer(reservationId: string): void {
    const h = this.timers.get(reservationId);
    if (h) { clearTimeout(h); this.timers.delete(reservationId); }
    this.activeAlerts.update(set => {
      const next = new Set(set);
      next.delete(reservationId);
      return next;
    });
  }

  // Zum Testen: sofort auslösen
  triggerNow(reservationId: string): void {
    if (!this.enabled()) return;
    this.activeAlerts.update(set => new Set([...set, reservationId]));
  }

  ngOnDestroy(): void {
    this.timers.forEach(h => clearTimeout(h));
  }

  private _scheduleNext(reservationId: string): void {
    const handle = setTimeout(() => {
      this.activeAlerts.update(set => new Set([...set, reservationId]));
      this.timers.delete(reservationId);
    }, this.minutes() * 60_000);
    this.timers.set(reservationId, handle);
  }
}
