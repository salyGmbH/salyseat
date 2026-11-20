import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { WhatsAppService, WhatsAppConfig } from '../../../services/whatsapp.service';

@Component({
  selector: 'app-whatsapp-anbindung',
  standalone: true,
  imports: [FormsModule, MatIconModule, TranslateModule],
  templateUrl: './whatsapp-anbindung.component.html',
  styleUrl: './whatsapp-anbindung.component.scss',
})
export class WhatsappAnbindungComponent implements OnInit {
  private readonly whatsapp  = inject(WhatsAppService);
  private readonly translate = inject(TranslateService);

  phoneNumberId = signal('');
  channelId     = signal('');
  apiKey        = signal('');
  baseUrl       = signal('https://waba-sandbox.360dialog.io');

  connected = signal(false);

  saving  = signal(false);
  saved   = signal(false);
  testing = signal(false);
  testOk  = signal<boolean | null>(null);
  error   = signal<string | null>(null);

  ngOnInit(): void {
    this.whatsapp.getConfig().subscribe({
      next: (cfg: WhatsAppConfig) => {
        if (cfg.phoneNumberId) this.phoneNumberId.set(cfg.phoneNumberId);
        if (cfg.channelId)     this.channelId.set(cfg.channelId);
        if (cfg.apiKey)        this.apiKey.set(cfg.apiKey);
        if (cfg.baseUrl)       this.baseUrl.set(cfg.baseUrl);
      },
    });
    this.refreshStatus();
  }

  refreshStatus(): void {
    this.whatsapp.status().subscribe(s => this.connected.set(s.connected));
  }

  testConnection(): void {
    this.testing.set(true);
    this.testOk.set(null);

    const config: WhatsAppConfig = {
      apiKey:  this.apiKey().trim(),
      baseUrl: this.baseUrl().trim(),
    };

    this.whatsapp.test(config).subscribe({
      next: r => { this.testOk.set(r.connected); this.connected.set(r.connected); this.testing.set(false); },
      error: () => { this.testOk.set(false); this.testing.set(false); },
    });
  }

  save(): void {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);

    const config: WhatsAppConfig = {
      phoneNumberId: this.phoneNumberId().trim(),
      channelId:     this.channelId().trim(),
      apiKey:        this.apiKey().trim(),
      baseUrl:       this.baseUrl().trim(),
    };

    this.whatsapp.saveConfig(config).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        this.refreshStatus();
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: () => {
        this.saving.set(false);
        this.error.set(this.translate.instant('whatsapp.error_save'));
      },
    });
  }

  disconnect(): void {
    if (!confirm(this.translate.instant('whatsapp.disconnect_confirm'))) return;
    this.whatsapp.saveConfig({ phoneNumberId: '', channelId: '', apiKey: '', baseUrl: '' }).subscribe({
      next: () => {
        this.phoneNumberId.set('');
        this.channelId.set('');
        this.apiKey.set('');
        this.connected.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 2500);
      },
    });
  }
}
