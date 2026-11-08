import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AuthUser, LoginRequest, LoginResponse } from './auth.types';

const TOKEN_KEY = 'salyseat.auth.token.v1';
const USER_KEY  = 'salyseat.auth.user.v1';

/**
 * Zentrale Auth-Logik fürs Admin-Frontend.
 *
 * - Login geht gegen POST /api/v1/auth/login im Symfony-Backend.
 * - JWT + User werden in localStorage gespeichert, damit der Admin nach Reload
 *   eingeloggt bleibt.
 * - Alle Komponenten/Guards/Interceptoren können über `token()` bzw.
 *   `isAuthenticated()` den aktuellen Zustand lesen (Angular Signals).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http   = inject(HttpClient);
  private readonly router = inject(Router);

  // Basis-URL des Symfony-Backends. Für Production via Proxy / gleiche Domain
  // kann hier auch einfach '' gesetzt werden.
  private readonly apiBase = '/api/v1';

  private readonly _token = signal<string | null>(this.loadToken());
  private readonly _user  = signal<AuthUser | null>(this.loadUser());

  readonly token           = computed(() => this._token());
  readonly user            = computed(() => this._user());
  readonly isAuthenticated = computed(() => this._token() !== null);

  // ── Login / Logout ────────────────────────────────────────────────────────
  login(email: string, password: string): Observable<LoginResponse> {
    const body: LoginRequest = { email, password };
    return this.http.post<LoginResponse>(`${this.apiBase}/auth/login`, body).pipe(
      tap(res => this.setSession(res)),
    );
  }

  logout(): void {
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
    } catch { /* ignore – z.B. privater Modus */ }
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
