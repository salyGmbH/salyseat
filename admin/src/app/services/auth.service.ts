import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AuthUser, LoginRequest, LoginResponse } from './auth.types';

const TOKEN_KEY = 'salyseat.auth.token.v1';
const USER_KEY  = 'salyseat.auth.user.v1';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http   = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly apiBase = '/api/v1';

  private readonly _token = signal<string | null>(this.loadToken());
  private readonly _user  = signal<AuthUser | null>(this.loadUser());

  readonly token           = computed(() => this._token());
  readonly user            = computed(() => this._user());
  readonly isAuthenticated = computed(() => this._token() !== null);

  private _logoutTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Beim App-Start: prüfen ob das gespeicherte Token schon abgelaufen ist,
    // sonst Timer bis zum Ablauf starten.
    this.scheduleAutoLogout();
  }

  // ── Login / Logout ────────────────────────────────────────────────────────
  login(email: string, password: string): Observable<LoginResponse> {
    const body: LoginRequest = { email, password };
    return this.http.post<LoginResponse>(`${this.apiBase}/auth/login`, body).pipe(
      tap(res => this.setSession(res)),
    );
  }

  logout(): void {
    if (this._logoutTimer) {
      clearTimeout(this._logoutTimer);
      this._logoutTimer = null;
    }
    this._token.set(null);
    this._user.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
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
    } catch { /* ignore */ }
    this.scheduleAutoLogout();
  }

  // ── Auto-Logout via JWT exp-Claim ─────────────────────────────────────────
  private scheduleAutoLogout(): void {
    if (this._logoutTimer) {
      clearTimeout(this._logoutTimer);
      this._logoutTimer = null;
    }

    const token = this._token();
    if (!token) return;

    try {
      const payload     = JSON.parse(atob(token.split('.')[1]));
      const exp: number = payload.exp;
      if (!exp) return;

      const msLeft = exp * 1000 - Date.now();

      if (msLeft <= 0) {
        this.logout();
        return;
      }

      // setTimeout ist auf ~24.8 Tage (2^31-1 ms) begrenzt — größere Werte
      // feuern sofort. Bei sehr langen Sessions (>23h) kein Timer nötig:
      // der Page-Load-Check im constructor() greift beim nächsten Aufruf.
      const MAX_TIMER_MS = 23 * 60 * 60 * 1000; // 23 Stunden
      if (msLeft > MAX_TIMER_MS) return;

      this._logoutTimer = setTimeout(() => this.logout(), msLeft);
    } catch {
      // Ungültiges Token-Format → ignorieren
    }
  }

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
