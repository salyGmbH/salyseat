import { Injectable, computed, inject, signal, NgZone } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AuthUser, LoginRequest, LoginResponse, Plan } from './auth.types';

const TOKEN_KEY          = 'salyseat.auth.token.v1';
const USER_KEY           = 'salyseat.auth.user.v1';
const LAST_ACTIVE_KEY    = 'salyseat.auth.lastActive.v1';
const INACTIVITY_TTL_KEY = 'salyseat.auth.inactivityTtl.v1'; // Inaktivitäts-Timeout in ms

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;
const CHECK_INTERVAL  = 30_000; // Inaktivitätsprüfung alle 30 Sekunden
const THROTTLE_MS     = 10_000; // Aktivitätserkennung max. einmal alle 10 Sekunden

const DEFAULT_INACTIVITY_MS = 3_600_000; // 1 Stunde Fallback

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http   = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly zone   = inject(NgZone);

  private readonly apiBase = '/api/v1';

  private readonly _token = signal<string | null>(this.loadToken());
  private readonly _user  = signal<AuthUser | null>(this.loadUser());

  readonly token           = computed(() => this._token());
  readonly user            = computed(() => this._user());
  readonly isAuthenticated = computed(() => this._token() !== null);
  readonly plan            = computed<Plan>(() => this._user()?.plan ?? 'tisch');

  private _checkTimer: ReturnType<typeof setInterval> | null = null;
  private _throttled = false;

  constructor() {
    this.initInactivityTracking();
    // Beim Start immer /me aufrufen um frische Daten aus der DB zu holen
    // (Plan, Rollen etc. könnten sich seit dem letzten Login geändert haben)
    if (this._token()) {
      this.http.get<AuthUser>(`${this.apiBase}/auth/me`).subscribe({
        next: freshUser => this.applyFreshUser(freshUser),
        // Token vom Server explizit abgelehnt (401/403) → alte, im localStorage
        // zwischengespeicherte Daten dürfen nicht stillschweigend weiter angezeigt
        // werden. Bei anderen Fehlern (z. B. Netzwerk kurz weg) bleibt der bisherige
        // Stand bestehen, statt den Nutzer grundlos auszuloggen.
        error: (err: HttpErrorResponse) => {
          if (err.status === 401 || err.status === 403) this.logout();
        },
      });
    }
  }

  refreshUser(): void {
    this.http.get<AuthUser>(`${this.apiBase}/auth/me`).subscribe({
      next: freshUser => this.applyFreshUser(freshUser),
      error: (err: HttpErrorResponse) => {
        if (err.status === 401 || err.status === 403) this.logout();
      },
    });
  }

  private applyFreshUser(user: AuthUser): void {
    this._user.set(user);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch { /* ignore */ }
  }

  // ── Login / Logout ────────────────────────────────────────────────────────
  login(email: string, password: string): Observable<LoginResponse> {
    const body: LoginRequest = { email, password };
    return this.http.post<LoginResponse>(`${this.apiBase}/auth/login`, body).pipe(
      tap(res => this.setSession(res)),
    );
  }

  logout(): void {
    this.stopTracking();
    this._token.set(null);
    this._user.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(LAST_ACTIVE_KEY);
      sessionStorage.removeItem('nf-dismissed');
    } catch { /* ignore */ }
    this.router.navigate(['/login']);
  }

  // ── Session-Handling ──────────────────────────────────────────────────────
  private setSession(res: LoginResponse): void {
    this._token.set(res.token);
    this._user.set(res.user);
    const inactivityMs = (res.inactivityTtlSeconds ?? 3600) * 1000;
    try {
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
      localStorage.setItem(INACTIVITY_TTL_KEY, String(inactivityMs));
    } catch { /* ignore */ }
    this.initInactivityTracking();
  }

  // ── Inaktivitäts-Tracking ─────────────────────────────────────────────────
  private initInactivityTracking(): void {
    this.stopTracking();
    if (!this._token()) return;

    // JWT-Ablauf beim Start prüfen (hartes Backend-Limit)
    if (this.isTokenExpired()) {
      this.logout();
      return;
    }

    // Inaktivitäts-Check beim Start
    if (this.isInactive()) {
      this.logout();
      return;
    }

    // Sicherstellen dass lastActive gesetzt ist
    this.touchActivity();

    this.zone.runOutsideAngular(() => {
      this._checkTimer = setInterval(() => {
        if (this.isTokenExpired() || this.isInactive()) {
          this.zone.run(() => this.logout());
        }
      }, CHECK_INTERVAL);

      ACTIVITY_EVENTS.forEach(ev =>
        document.addEventListener(ev, this.onActivity, { passive: true })
      );
      // Plan/Add-ons können von der Superadmin jederzeit geändert werden, während
      // die Admin-Session bereits offen ist. Statt darauf zu vertrauen, dass ein
      // Reload zuverlässig frische Daten holt, ziehen wir /me zusätzlich immer
      // dann nach, wenn der Tab wieder in den Vordergrund kommt.
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      window.addEventListener('focus', this.onWindowFocus);
    });
  }

  private stopTracking(): void {
    if (this._checkTimer) {
      clearInterval(this._checkTimer);
      this._checkTimer = null;
    }
    this._throttled = false;
    ACTIVITY_EVENTS.forEach(ev =>
      document.removeEventListener(ev, this.onActivity)
    );
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('focus', this.onWindowFocus);
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this.zone.run(() => this.refreshUser());
    }
  };

  private readonly onWindowFocus = (): void => {
    this.zone.run(() => this.refreshUser());
  };

  private readonly onActivity = (): void => {
    if (this._throttled) return;
    this._throttled = true;
    setTimeout(() => { this._throttled = false; }, THROTTLE_MS);
    this.touchActivity();
  };

  private touchActivity(): void {
    try {
      localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
    } catch { /* ignore */ }
  }

  private isInactive(): boolean {
    const ttlMs = this.getInactivityTtlMs();
    try {
      const raw = localStorage.getItem(LAST_ACTIVE_KEY);
      if (!raw) return false; // kein Eintrag → als aktiv werten
      const lastActive = parseInt(raw, 10);
      return Date.now() > lastActive + ttlMs;
    } catch {
      return false;
    }
  }

  private isTokenExpired(): boolean {
    const token = this._token();
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      // Nur hartes JWT-Ablaufdatum prüfen (30-Tage-Limit vom Backend)
      return payload.exp ? Date.now() >= payload.exp * 1000 : false;
    } catch {
      return false;
    }
  }

  // Inaktivitäts-TTL aus localStorage lesen (wird beim Login gespeichert)
  private getInactivityTtlMs(): number {
    try {
      const raw = localStorage.getItem(INACTIVITY_TTL_KEY);
      if (raw) {
        const ms = parseInt(raw, 10);
        if (ms > 0) return ms;
      }
    } catch { /* ignore */ }
    return DEFAULT_INACTIVITY_MS;
  }

  /** Wird vom TenantSettingsService aufgerufen wenn der Inaktivitäts-Timeout geändert wird */
  updateInactivityTtl(seconds: number): void {
    try {
      localStorage.setItem(INACTIVITY_TTL_KEY, String(seconds * 1000));
    } catch { /* ignore */ }
  }

  // ── Storage-Helpers ───────────────────────────────────────────────────────
  private loadToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private loadUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }
}
