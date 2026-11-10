import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TenantSettingsService } from '../../../services/tenant-settings.service';
import { AuthService } from '../../../services/auth.service';

interface SessionOption {
  label: string;
  seconds: number;
}

@Component({
  selector: 'app-einstellungen-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private readonly tenantSettings = inject(TenantSettingsService);
  private readonly auth           = inject(AuthService);

  readonly sessionOptions: SessionOption[] = [
    { label: '1 Minute (Test)',  seconds: 60     },
    { label: '30 Minuten',       seconds: 1800   },
    { label: '1 Stunde',         seconds: 3600   },
    { label: '2 Stunden',   seconds: 7200   },
    { label: '4 Stunden',   seconds: 14400  },
    { label: '8 Stunden',   seconds: 28800  },
    { label: '1 Tag',       seconds: 86400  },
    { label: '7 Tage',      seconds: 604800 },
    { label: '30 Tage',     seconds: 2592000},
  ];

  selectedTtl = signal(3600);
  saving       = signal(false);
  saved        = signal(false);
  needsRelogin = signal(false);
  error        = signal<string | null>(null);

  ngOnInit(): void {
    this.tenantSettings.load().subscribe(s => {
      if (s.sessionTtlSeconds) this.selectedTtl.set(s.sessionTtlSeconds);
    });
  }

  save(): void {
    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);

    const snapshot = this.tenantSettings.snapshot;
    this.tenantSettings.save({ ...snapshot, sessionTtlSeconds: this.selectedTtl() }).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        this.needsRelogin.set(true);
        setTimeout(() => this.saved.set(false), 2500);
      },
      error: () => {
        this.saving.set(false);
        this.error.set('Fehler beim Speichern. Bitte erneut versuchen.');
      },
    });
  }

  currentLabel(): string {
    return this.sessionOptions.find(o => o.seconds === this.selectedTtl())?.label ?? '1 Stunde';
  }

  relogin(): void {
    this.auth.logout();
  }
}
