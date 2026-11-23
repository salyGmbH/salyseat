import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';
import { TenantSettingsService } from './tenant-settings.service';

export interface GetraenkeSettings {
  enabled: boolean;
  minutes: number;
}

export const DEFAULT_GETRAENKE_SETTINGS: GetraenkeSettings = { enabled: false, minutes: 20 };
const DEFAULTS: GetraenkeSettings = DEFAULT_GETRAENKE_SETTINGS;

// Persistenz im Browser, damit ein Reload weder einen laufenden Countdown
// noch ein bereits ausgelöstes (aber noch nicht bestätigtes) Icon verwirft —
// beides lebt sonst nur als setTimeout/Set im Speicher und wäre nach jedem
// Reload weg.
const DUE_KEY    = 'salyseat.getraenke.due.v1';
const ALERTS_KEY = 'salyseat.getraenke.alerts.v1';

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
  // Fälligkeitszeitpunkt (epoch ms) je Reservierung — persistiert, damit nach
  // einem Reload der Rest-Countdown (statt eines neuen vollen Intervalls)
  // weiterläuft bzw. ein längst überfälliger Alert sofort wieder auftaucht.
  private dueAt = new Map<string, number>();

  constructor() {
    this.restoreFromStorage();
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

  // ── Timer starten (beim Einchecken bzw. beim Wiederherstellen nach Reload
  //    für bereits eingecheckte Gäste aufrufen) ─────────────────────────────
  startTimer(reservationId: string): void {
    if (!this.enabled()) return;
    if (this.dueAt.has(reservationId) || this.activeAlerts().has(reservationId)) return;
    this._arm(reservationId, Date.now() + this.minutes() * 60_000);
  }

  // ── Alert bestätigen — Icon verschwindet, Timer startet neu ──────────────
  acknowledgeAlert(reservationId: string): void {
    this.activeAlerts.update(set => {
      const next = new Set(set);
      next.delete(reservationId);
      return next;
    });
    this.persistAlerts();
    if (this.enabled()) {
      this._arm(reservationId, Date.now() + this.minutes() * 60_000);
    }
  }

  // ── Timer stoppen (beim Auschecken / Stornieren) ──────────────────────────
  // No-op-sicher: wird auch für Reservierungen aufgerufen, die nie einen
  // Timer hatten (siehe Aufräum-Effect in raum-detail), daher nur bei
  // tatsächlicher Änderung ins Local Storage schreiben.
  cancelTimer(reservationId: string): void {
    const h = this.timers.get(reservationId);
    if (h) { clearTimeout(h); this.timers.delete(reservationId); }
    if (this.dueAt.delete(reservationId)) {
      this.persistDue();
    }

    if (this.activeAlerts().has(reservationId)) {
      this.activeAlerts.update(set => {
        const next = new Set(set);
        next.delete(reservationId);
        return next;
      });
      this.persistAlerts();
    }
  }

  // Zum Testen: sofort auslösen
  triggerNow(reservationId: string): void {
    if (!this.enabled()) return;
    this._fire(reservationId);
  }

  ngOnDestroy(): void {
    this.timers.forEach(h => clearTimeout(h));
  }

  // ── Intern ────────────────────────────────────────────────────────────────
  private _arm(reservationId: string, dueAt: number): void {
    this.dueAt.set(reservationId, dueAt);
    this.persistDue();
    const remaining = dueAt - Date.now();
    if (remaining <= 0) {
      this._fire(reservationId);
      return;
    }
    const handle = setTimeout(() => this._fire(reservationId), remaining);
    this.timers.set(reservationId, handle);
  }

  private _fire(reservationId: string): void {
    this.timers.delete(reservationId);
    this.dueAt.delete(reservationId);
    this.persistDue();
    this.activeAlerts.update(set => new Set([...set, reservationId]));
    this.persistAlerts();
  }

  private restoreFromStorage(): void {
    try {
      const alertsRaw = localStorage.getItem(ALERTS_KEY);
      if (alertsRaw) this.activeAlerts.set(new Set(JSON.parse(alertsRaw)));
    } catch { /* ignore */ }

    try {
      const dueRaw = localStorage.getItem(DUE_KEY);
      if (!dueRaw) return;
      const obj = JSON.parse(dueRaw) as Record<string, number>;
      for (const [reservationId, dueAt] of Object.entries(obj)) {
        this.dueAt.set(reservationId, dueAt);
        const remaining = dueAt - Date.now();
        if (remaining <= 0) {
          this._fire(reservationId);
        } else {
          const handle = setTimeout(() => this._fire(reservationId), remaining);
          this.timers.set(reservationId, handle);
        }
      }
    } catch { /* ignore */ }
  }

  private persistDue(): void {
    try {
      const obj: Record<string, number> = {};
      this.dueAt.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(DUE_KEY, JSON.stringify(obj));
    } catch { /* ignore */ }
  }

  private persistAlerts(): void {
    try {
      localStorage.setItem(ALERTS_KEY, JSON.stringify([...this.activeAlerts()]));
    } catch { /* ignore */ }
  }
}
