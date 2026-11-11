import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TenantSettingsService } from '../../../services/tenant-settings.service';
import { AuthService } from '../../../services/auth.service';

interface SessionOption {
  labelKey: string;
  seconds: number;
}

@Component({
  selector: 'app-einstellungen-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, TranslateModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private readonly tenantSettings = inject(TenantSettingsService);
  private readonly auth           = inject(AuthService);
  private readonly translate      = inject(TranslateService);

  readonly sessionOptions: SessionOption[] = [
    { labelKey: 'login_settings.session_1min',  seconds: 60      },
    { labelKey: 'login_settings.session_30min', seconds: 1800    },
    { labelKey: 'login_settings.session_1h',    seconds: 3600    },
    { labelKey: 'login_settings.session_2h',    seconds: 7200    },
    { labelKey: 'login_settings.session_4h',    seconds: 14400   },
    { labelKey: 'login_settings.session_8h',    seconds: 28800   },
    { labelKey: 'login_settings.session_1d',    seconds: 86400   },
    { labelKey: 'login_settings.session_7d',    seconds: 604800  },
    { labelKey: 'login_settings.session_30d',   seconds: 2592000 },
  ];

  selectedTtl  = signal(3600);
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
        this.error.set(this.translate.instant('login_settings.save_error'));
      },
    });
  }

  currentLabel(): string {
    const key = this.sessionOptions.find(o => o.seconds === this.selectedTtl())?.labelKey
      ?? 'login_settings.session_1h';
    return this.translate.instant(key);
  }

  relogin(): void {
    this.auth.logout();
  }
}
