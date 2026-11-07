import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_RESERVATION_TIMING,
  ReservationTimingSettings,
  TenantSettingsService,
} from './tenant-settings.service';
import { FloorReservationsService } from './floor-reservations.service';
import { FloorReservation } from './floor-reservation.types';

/**
 * Zentraler Service rund um Reservierungs-Timing:
 *
 *   • Lädt + persistiert die Timing-Einstellungen (Standard-Dauer,
 *     Auto-Expire, Clean-up) via TenantSettingsService.
 *   • Stellt sie als Signals bereit, damit UI + andere Services live
 *     darauf reagieren können.
 *   • Hält einen Heartbeat-Timer am Laufen, der jede Minute geprüft,
 *     ob eingecheckte Reservierungen ihre Standard-Dauer überschritten
 *     haben — dann wird der Status auf "expired" gesetzt.
 *
 * Hinweis: Die eigentliche Slot-Verfügbarkeitsprüfung im Widget
 * (= effektives Belegungsende = Start + Dauer + Clean-up) sollte später
 * den Helper {@link occupancyEndMs} nutzen.
 */
@Injectable({ providedIn: 'root' })
export class ReservationTimingService {
  private readonly tenantSettings = inject(TenantSettingsService);
  private readonly reservations   = inject(FloorReservationsService);

  /** Aktuelle Timing-Einstellungen — startet mit Defaults, wird aus Backend überschrieben. */
  private readonly _settings = signal<ReservationTimingSettings>({
    ...DEFAULT_RESERVATION_TIMING,
  });
  readonly settings = computed(() => this._settings());

  /** Schnelle Einzel-Selektoren für die UI. */
  readonly defaultDurationMinutes = computed(() => this._settings().defaultDurationMinutes);
  readonly autoExpireEnabled      = computed(() => this._settings().autoExpireEnabled);
  readonly cleanupEnabled         = computed(() => this._settings().cleanupEnabled);
  readonly cleanupMinutes         = computed(() => this._settings().cleanupMinutes);

  /** Heartbeat — jede Minute Auto-Expire prüfen. Stoppt nicht (App-weit aktiv). */
  private timerHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.tenantSettings.load().subscribe(s => {
      if (s.reservationTiming) {
        this._settings.set({ ...DEFAULT_RESERVATION_TIMING, ...s.reservationTiming });
      }
    });
    this.startHeartbeat();
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Persistenz
  // ──────────────────────────────────────────────────────────────────────
  /**
   * Settings lokal updaten und ans Backend schicken. Das Local-Update
   * passiert sofort (Optimistic UI), das HTTP-Save läuft im Hintergrund.
   * Wichtig: Wir senden den kompletten zuletzt gesehenen Tenant-Snapshot,
   * damit Status-Farben & Co. erhalten bleiben (Backend = PUT-Replace).
   */
  save(patch: Partial<ReservationTimingSettings>): void {
    const next: ReservationTimingSettings = { ...this._settings(), ...patch };
    this._settings.set(next);
    this.tenantSettings.save({ ...this.tenantSettings.snapshot, reservationTiming: next }).subscribe();
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Helper für Slot-Berechnung & Auto-Expire
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Liefert den Reservierungs-Start als JS-Date.
   * Erwartet date = "YYYY-MM-DD", time = "HH:MM".
   */
  startMs(res: Pick<FloorReservation, 'date' | 'time'>): number {
    const [y, m, d] = res.date.split('-').map(n => parseInt(n, 10));
    const [hh, mm]  = res.time.split(':').map(n => parseInt(n, 10));
    return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0).getTime();
  }

  /**
   * Reines "Reservierungsende" = Start + (gespeicherte Dauer ?? Default).
   * Die individuelle Reservierung kann eine eigene Dauer mitbringen —
   * dann hat die Vorrang vor dem globalen Default.
   */
  reservationEndMs(res: FloorReservation): number {
    const dur = res.durationMinutes && res.durationMinutes > 0
      ? res.durationMinutes
      : this.defaultDurationMinutes();
    return this.startMs(res) + dur * 60_000;
  }

  /**
   * Effektives "Tisch-frei-ab" = Reservierungsende + Clean-up (falls aktiv).
   * Diesen Wert nutzt das Widget, um den Tisch wieder als buchbar zu zeigen.
   */
  occupancyEndMs(res: FloorReservation): number {
    const base = this.reservationEndMs(res);
    return this.cleanupEnabled() ? base + this.cleanupMinutes() * 60_000 : base;
  }

  /** Ist die Reservierung bezogen auf den aktuellen Zeitpunkt abgelaufen? */
  isExpired(res: FloorReservation, now: number = Date.now()): boolean {
    return now >= this.reservationEndMs(res);
  }

  /**
   * Ist die Clean-up-Phase vorbei? Maßstab ist {@link FloorReservation.updatedAt}
   * vom Moment, wo die Reservation in den Cleanup-Status gewechselt wurde.
   * Wenn cleanupEnabled = false ist, ist Cleanup sofort vorbei (kein Cleanup nötig).
   */
  isCleanupDone(res: FloorReservation, now: number = Date.now()): boolean {
    if (!this.cleanupEnabled()) return true;
    const cleanupMs = this.cleanupMinutes() * 60_000;
    return now >= (res.updatedAt + cleanupMs);
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Auto-Expire-Heartbeat
  // ──────────────────────────────────────────────────────────────────────
  private startHeartbeat(): void {
    if (this.timerHandle) return;
    // Sofort einmal prüfen, danach jede Minute.
    this.runExpiryCheck();
    this.timerHandle = setInterval(() => this.runExpiryCheck(), 60_000);
  }

  /**
   * Heartbeat-Logik:
   *   • Auto-Expire: 'seated' → 'expired', wenn Dauer abgelaufen
   *     (nur wenn autoExpireEnabled).
   *   • Cleanup-Ende: 'cleanup' → 'completed', wenn die Cleanup-Zeit
   *     seit dem Statuswechsel (updatedAt) vorbei ist
   *     (nur wenn cleanupEnabled, sonst regelt das markCompleted direkt).
   */
  private runExpiryCheck(): void {
    const now = Date.now();
    const list = this.reservations.reservations();
    for (const r of list) {
      if (this.autoExpireEnabled()
          && r.status === 'seated'
          && this.isExpired(r, now)) {
        this.reservations.setStatus(r.id, 'expired');
      }
      if (this.cleanupEnabled()
          && r.status === 'cleanup'
          && this.isCleanupDone(r, now)) {
        this.reservations.setStatus(r.id, 'completed');
      }
    }
  }
}
