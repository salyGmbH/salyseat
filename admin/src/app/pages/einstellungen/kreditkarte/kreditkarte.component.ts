import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DEFAULT_WIDGET_FUNCTIONAL, TenantSettingsService } from '../../../services/tenant-settings.service';

@Component({
  selector: 'app-kreditkarte',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, TranslateModule],
  templateUrl: './kreditkarte.component.html',
  styleUrl: './kreditkarte.component.scss',
})
export class KreditkarteComponent implements OnInit {
  private readonly tenantSettings = inject(TenantSettingsService);
  private readonly translate       = inject(TranslateService);

  publishableKey    = signal('');
  zahlungAktiv      = signal(false);
  zahlungPflicht    = signal(false);
  methKreditkarte   = signal(false);
  methSepa          = signal(false);
  methVorkasse      = signal(false);
  methBar           = signal(false);

  noShowSchutzAktiv = signal(false);
  noShowBetragEuro  = signal('20');
  noShowWidgetText  = signal('Kreditkarte wird nur bei Nicht-Erscheinen belastet.');

  saving = signal(false);
  saved  = signal(false);
  error  = signal<string | null>(null);

  readonly keyMode = computed<'live' | 'test' | 'empty'>(() => {
    const k = this.publishableKey().trim();
    if (k.startsWith('pk_live_')) return 'live';
    if (k.startsWith('pk_test_')) return 'test';
    return 'empty';
  });

  readonly canActivate = computed(() => this.keyMode() !== 'empty');

  ngOnInit(): void {
    this.tenantSettings.load().subscribe(s => {
      const fn = s.widgetFunctional ?? DEFAULT_WIDGET_FUNCTIONAL;
      this.zahlungAktiv.set(fn.zahlungAktiv ?? false);
      this.zahlungPflicht.set(fn.zahlungPflicht ?? false);
      this.methKreditkarte.set(fn.zahlungsmethoden?.kreditkarte ?? false);
      this.methSepa.set(fn.zahlungsmethoden?.sepa ?? false);
      this.methVorkasse.set(fn.zahlungsmethoden?.vorkasse ?? false);
      this.methBar.set(fn.zahlungsmethoden?.bar ?? false);
      this.publishableKey.set(s.stripeSettings?.publishableKey ?? '');
      this.noShowSchutzAktiv.set(fn.noShowSchutzAktiv ?? false);
      const betragCents = fn.noShowBetragCents ?? 2000;
      this.noShowBetragEuro.set((betragCents / 100).toFixed(2).replace('.', ','));
      this.noShowWidgetText.set(fn.noShowWidgetText ?? 'Kreditkarte wird nur bei Nicht-Erscheinen belastet.');
    });
  }

  toggleZahlungAktiv(): void {
    if (!this.canActivate() && !this.zahlungAktiv()) return;
    this.zahlungAktiv.update(v => !v);
    if (!this.zahlungAktiv()) this.zahlungPflicht.set(false);
  }

  save(): void {
    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);

    const snapshot = this.tenantSettings.snapshot;
    const fn = { ...(snapshot.widgetFunctional ?? DEFAULT_WIDGET_FUNCTIONAL) };
    fn.zahlungAktiv    = this.zahlungAktiv();
    fn.zahlungPflicht  = this.zahlungPflicht();
    fn.noShowSchutzAktiv = this.noShowSchutzAktiv();
    fn.noShowBetragCents = Math.round(parseFloat(this.noShowBetragEuro().replace(',', '.')) * 100) || 2000;
    fn.noShowWidgetText  = this.noShowWidgetText();
    fn.zahlungsmethoden = {
      kreditkarte: this.methKreditkarte(),
      sepa:        this.methSepa(),
      vorkasse:    this.methVorkasse(),
      bar:         this.methBar(),
    };

    this.tenantSettings.save({
      ...snapshot,
      widgetFunctional: fn,
      stripeSettings:   { publishableKey: this.publishableKey().trim() },
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 2500);
      },
      error: () => {
        this.saving.set(false);
        this.error.set(this.translate.instant('stripe_settings.save_error'));
      },
    });
  }
}
