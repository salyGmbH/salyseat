import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PmsService, PmsConfig } from '../../../services/pms.service';

@Component({
  selector: 'app-pms-anbindung',
  standalone: true,
  imports: [FormsModule, MatIconModule, TranslateModule],
  templateUrl: './pms-anbindung.component.html',
  styleUrl: './pms-anbindung.component.scss',
})
export class PmsAnbindungComponent implements OnInit {
  private readonly pms       = inject(PmsService);
  private readonly translate = inject(TranslateService);

  provider           = signal<string>('mews');
  clientToken        = signal('');
  accessToken        = signal('');
  baseUrl            = signal('https://api.mews-demo.com');
  serviceId          = signal('');
  resourceCategoryId = signal('');
  rateId             = signal('');
  ageCategoryId      = signal('');

  saving  = signal(false);
  saved   = signal(false);
  testing = signal(false);
  testOk  = signal<boolean | null>(null);
  error   = signal<string | null>(null);

  readonly isDemoEnv = () => this.baseUrl().includes('demo');

  ngOnInit(): void {
    this.pms.getConfig().subscribe({
      next: (cfg: PmsConfig) => {
        if (cfg.provider) this.provider.set(cfg.provider);
        if (cfg.clientToken) this.clientToken.set(cfg.clientToken);
        if (cfg.accessToken) this.accessToken.set(cfg.accessToken);
        if (cfg.baseUrl)     this.baseUrl.set(cfg.baseUrl);
        if (cfg.serviceId)          this.serviceId.set(cfg.serviceId);
        if (cfg.resourceCategoryId) this.resourceCategoryId.set(cfg.resourceCategoryId);
        if (cfg.rateId)             this.rateId.set(cfg.rateId);
        if (cfg.ageCategoryId)      this.ageCategoryId.set(cfg.ageCategoryId);
      },
    });
  }

  toggleEnv(): void {
    this.baseUrl.set(
      this.isDemoEnv() ? 'https://api.mews.com' : 'https://api.mews-demo.com'
    );
  }

  testConnection(): void {
    this.testing.set(true);
    this.testOk.set(null);
    this.pms.status().subscribe({
      next: s => { this.testOk.set(s.enabled); this.testing.set(false); },
      error: ()  => { this.testOk.set(false);  this.testing.set(false); },
    });
  }

  save(): void {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);

    const config: PmsConfig = {
      provider:           this.provider(),
      clientToken:        this.clientToken().trim(),
      accessToken:        this.accessToken().trim(),
      baseUrl:            this.baseUrl(),
      serviceId:          this.serviceId().trim(),
      resourceCategoryId: this.resourceCategoryId().trim(),
      rateId:             this.rateId().trim(),
      ageCategoryId:      this.ageCategoryId().trim(),
    };

    this.pms.saveConfig(config).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: () => {
        this.saving.set(false);
        this.error.set(this.translate.instant('pms.error_save'));
      },
    });
  }

  disconnect(): void {
    if (!confirm(this.translate.instant('pms.disconnect_confirm'))) return;
    this.pms.saveConfig({ provider: '' }).subscribe({
      next: () => {
        this.clientToken.set('');
        this.accessToken.set('');
        this.serviceId.set('');
        this.resourceCategoryId.set('');
        this.rateId.set('');
        this.ageCategoryId.set('');
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 2500);
      },
    });
  }
}
