import { Injectable, computed, inject, signal, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AuthUser, LoginRequest, LoginResponse } from './auth.types';

const TOKEN_KEY       = 'salyseat.auth.token.v1';
const USER_KEY        = 'salyseat.auth.user.v1';
const LAST_ACTIVE_KEY = 'salyseat.auth.lastActive.v1';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;
const CHECK_INTERVAL  = 30_000; // Inaktivitätsprüfung alle 30 Sekunden
const THROTTLE_MS     = 30_000; // Aktivitätserkennung max. einmal alle 30 Sekunden

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

  private _checkTimer: ReturnType<typeof setInterval> | null = null;
  private _throttled = false;

  constructor() {
    this.initInactivityTracking();
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
    try {
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
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
  }

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
    const ttlMs = this.getTtlMs();
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
      return payload.exp ? Date.now() >= payload.exp * 1000 : false;
    } catch {
      return false;
    }
  }

  // TTL aus JWT-Payload ableiten (exp - iat), Fallback 1 Stunde
  private getTtlMs(): number {
    const token = this._token();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.iat) return (payload.exp - payload.iat) * 1000;
      } catch { /* ignore */ }
    }
    return 3_600_000;
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
