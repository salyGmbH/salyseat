import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';

export interface PlatformUser {
  email: string;
  roles: string[];
}

const TOKEN_KEY = 'sa_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly user = signal<PlatformUser | null>(null);

  constructor() {
    if (this.token()) this.loadMe();
  }

  token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.token();
  }

  login(email: string, password: string) {
    return this.http.post<{ token: string }>('/api/v1/auth/login', { email, password }).pipe(
      tap(res => {
        localStorage.setItem(TOKEN_KEY, res.token);
        this.loadMe();
      }),
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.user.set(null);
  }

  private loadMe(): void {
    this.http.get<PlatformUser>('/api/v1/auth/me').subscribe({
      next: u => this.user.set(u),
      error: () => this.logout(),
    });
  }
}
