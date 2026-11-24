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

  infoHeader  = signal(false);
  infoStripe  = signal(false);
  infoNoshow  = signal(false);

  publishableKey    = signal('');

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
      this.publishableKey.set(s.stripeSettings?.publishableKey ?? '');
      this.noShowSchutzAktiv.set(fn.noShowSchutzAktiv ?? false);
      const betragCents = fn.noShowBetragCents ?? 2000;
      this.noShowBetragEuro.set((betragCents / 100).toFixed(2).replace('.', ','));
      this.noShowWidgetText.set(fn.noShowWidgetText ?? 'Kreditkarte wird nur bei Nicht-Erscheinen belastet.');
    });
  }

  save(): void {
    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);

    const snapshot = this.tenantSettings.snapshot;
    const fn = { ...(snapshot.widgetFunctional ?? DEFAULT_WIDGET_FUNCTIONAL) };
    // Online-Zahlung (Sofort-Kassieren) wird über diese Seite bewusst nicht mehr
    // angeboten — nur noch der No-Show-Schutz (Karte hinterlegen, erst bei
    // Nichterscheinen abbuchen). Explizit deaktiviert halten, unabhängig vom
    // zuvor gespeicherten Wert.
    fn.zahlungAktiv    = false;
    fn.zahlungPflicht  = false;
    fn.noShowSchutzAktiv = this.noShowSchutzAktiv();
    fn.noShowBetragCents = Math.round(parseFloat(this.noShowBetragEuro().replace(',', '.')) * 100) || 2000;
    fn.noShowWidgetText  = this.noShowWidgetText();

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
