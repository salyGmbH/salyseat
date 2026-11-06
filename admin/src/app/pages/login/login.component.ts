import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

/**
 * Startseite / Login. Schickt E-Mail + Passwort ans Backend
 * (POST /api/v1/auth/login) und leitet bei Erfolg auf das Dashboard
 * (oder auf die ursprünglich angefragte URL via ?returnUrl=).
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth   = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);

  email    = '';
  password = '';

  readonly showPassword = signal(false);
  readonly loading      = signal(false);
  readonly error        = signal<string | null>(null);

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(form: NgForm): void {
    if (form.invalid || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => {
        this.loading.set(false);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard';
        this.router.navigateByUrl(returnUrl);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (err.status === 401) {
          this.error.set('Ungültige Zugangsdaten.');
        } else if (err.status === 422) {
          this.error.set('Bitte gib eine gültige E-Mail und ein Passwort ein.');
        } else if (err.status === 0) {
          this.error.set('Server nicht erreichbar. Bitte später erneut versuchen.');
        } else {
          this.error.set('Login fehlgeschlagen. Bitte später erneut versuchen.');
        }
      },
    });
  }
}
