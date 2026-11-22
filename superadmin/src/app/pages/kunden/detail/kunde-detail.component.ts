import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Tenant, TenantDetailsDto, WhatsAppConfig } from '../../../services/tenants.service';
import { TenantsService } from '../../../services/tenants.service';
import { PricingService, PlanPrices } from '../../../services/pricing.service';
import { AddonsService } from '../../../services/addons.service';

@Component({
  selector: 'app-kunde-detail',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: './kunde-detail.component.html',
  styleUrl: './kunde-detail.component.scss',
})
export class KundeDetailComponent implements OnChanges {
  @Input()  tenant!: Tenant;
  @Output() closed  = new EventEmitter<Tenant | null>();

  private readonly svc       = inject(TenantsService);
  private readonly pricing   = inject(PricingService);
  private readonly addonsSvc = inject(AddonsService);

  prices = signal<PlanPrices | null>(null);

  saving        = signal(false);
  saved         = signal(false);
  resetting     = signal(false);
  newPassword   = signal<{ email: string; password: string } | null>(null);
  activeTab     = signal<'allgemein' | 'vertrag' | 'adresse' | 'rechnung' | 'notizen' | 'whatsapp'>('allgemein');

  /** Add-on-Katalog, dynamisch von /api/v1/superadmin/addons geladen. */
  readonly addonCatalog = signal<{ key: string; label: string; icon: string }[]>([]);
  addonSaving = signal<string | null>(null);
  /** Wird bei jedem Add-on-Toggle mit der aktuellen Tenant-Antwort befüllt, damit die
   *  Kundenliste beim Schließen des Modals auch ohne "Speichern"-Klick aktualisiert wird. */
  private latestTenant: Tenant | null = null;

  waPhoneNumberId = '';
  waChannelId     = '';
  waApiKey        = '';
  waBaseUrl       = 'https://waba-sandbox.360dialog.io';
  waLoaded        = signal(false);
  waSaving        = signal(false);
  waSaved         = signal(false);

  readonly contractDurations = [
    { key: 'monthly', label: 'Monatlich',      desc: '1 Monat Laufzeit' },
    { key: 'yearly',  label: 'Jahresvertrag',  desc: '12 Monate Laufzeit' },
    { key: '2yearly', label: '2-Jahresvertrag',desc: '24 Monate Laufzeit' },
  ];

  readonly cancellationPeriods = [
    { key: '14days',   label: '14 Tage' },
    { key: '30days',   label: '1 Monat' },
    { key: '3months',  label: '3 Monate' },
  ];

  // Form fields
  name               = '';
  contactEmail       = '';
  contactPhone       = '';
  street             = '';
  zip                = '';
  city               = '';
  country            = '';
  billCompany        = '';
  billVatId          = '';
  billStreet         = '';
  billZip            = '';
  billCity           = '';
  billCountry        = '';
  internalNotes      = '';
  contractDuration   = '';
  cancellationPeriod = '';
  contractStart      = '';

  constructor() {
    this.pricing.getPrices().subscribe(p => this.prices.set(p));
    this.addonsSvc.list().subscribe(list => {
      this.addonCatalog.set(list.map(a => ({ key: a.key, label: a.name, icon: a.icon })));
    });
  }

  ngOnChanges(): void {
    if (!this.tenant) return;
    this.latestTenant = null;
    const t = this.tenant;
    this.name               = t.name;
    this.contactEmail       = t.contactEmail ?? '';
    this.contactPhone       = t.contactPhone ?? '';
    this.street             = t.address?.street  ?? '';
    this.zip                = t.address?.zip     ?? '';
    this.city               = t.address?.city    ?? '';
    this.country            = t.address?.country ?? '';
    this.billCompany        = t.billingAddress?.companyName ?? '';
    this.billVatId          = t.billingAddress?.vatId       ?? '';
    this.billStreet         = t.billingAddress?.street      ?? '';
    this.billZip            = t.billingAddress?.zip         ?? '';
    this.billCity           = t.billingAddress?.city        ?? '';
    this.billCountry        = t.billingAddress?.country     ?? '';
    this.internalNotes      = t.internalNotes      ?? '';
    this.contractDuration   = t.contractDuration   ?? '';
    this.cancellationPeriod = t.cancellationPeriod ?? '';
    this.contractStart      = t.contractStart      ?? '';

    this.waLoaded.set(false);
    this.svc.getWhatsappConfig(t.id).subscribe(cfg => {
      this.waPhoneNumberId = cfg.phoneNumberId ?? '';
      this.waChannelId     = cfg.channelId ?? '';
      this.waApiKey        = cfg.apiKey ?? '';
      if (cfg.baseUrl) this.waBaseUrl = cfg.baseUrl;
      this.waLoaded.set(true);
    });
  }

  saveWhatsapp(): void {
    this.waSaving.set(true);
    this.waSaved.set(false);
    const dto: WhatsAppConfig = {
      phoneNumberId: this.waPhoneNumberId.trim(),
      channelId:     this.waChannelId.trim(),
      apiKey:        this.waApiKey.trim(),
      baseUrl:       this.waBaseUrl.trim(),
    };
    this.svc.saveWhatsappConfig(this.tenant.id, dto).subscribe({
      next: () => {
        this.waSaving.set(false);
        this.waSaved.set(true);
        setTimeout(() => this.waSaved.set(false), 2500);
      },
      error: () => this.waSaving.set(false),
    });
  }

  disconnectWhatsapp(): void {
    if (!confirm('WhatsApp-Verbindung für diesen Kunden wirklich vollständig trennen? Alle Zugangsdaten werden gelöscht.')) return;
    this.waSaving.set(true);
    // Bewusst alle Felder explizit leer senden — umgeht den Masken-Schutz
    // (der ein Speichern mit noch angezeigten "***…"-Sternchen im API-Key-Feld
    // nicht als "löschen" interpretiert, siehe saveWhatsapp()).
    const dto: WhatsAppConfig = { phoneNumberId: '', channelId: '', apiKey: '', baseUrl: '' };
    this.svc.saveWhatsappConfig(this.tenant.id, dto).subscribe({
      next: () => {
        this.waPhoneNumberId = '';
        this.waChannelId     = '';
        this.waApiKey        = '';
        this.waBaseUrl       = 'https://waba-sandbox.360dialog.io';
        this.waSaving.set(false);
        this.waSaved.set(true);
        setTimeout(() => this.waSaved.set(false), 2500);
      },
      error: () => this.waSaving.set(false),
    });
  }

  contractEndDate(): string | null {
    if (!this.contractStart || !this.contractDuration) return null;
    const start = new Date(this.contractStart);
    if (this.contractDuration === 'monthly') start.setMonth(start.getMonth() + 1);
    if (this.contractDuration === 'yearly')  start.setFullYear(start.getFullYear() + 1);
    if (this.contractDuration === '2yearly') start.setFullYear(start.getFullYear() + 2);
    return start.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  durationLabel(): string {
    return this.contractDurations.find(d => d.key === this.contractDuration)?.label ?? '—';
  }

  periodLabel(): string {
    return this.cancellationPeriods.find(p => p.key === this.cancellationPeriod)?.label ?? '—';
  }

  save(): void {
    this.saving.set(true);
    this.saved.set(false);

    const dto: TenantDetailsDto = {
      name:               this.name,
      contactEmail:       this.contactEmail,
      contactPhone:       this.contactPhone,
      address:            { street: this.street, zip: this.zip, city: this.city, country: this.country },
      billingAddress:     { companyName: this.billCompany, vatId: this.billVatId, street: this.billStreet, zip: this.billZip, city: this.billCity, country: this.billCountry },
      internalNotes:      this.internalNotes,
      contractDuration:   this.contractDuration,
      cancellationPeriod: this.cancellationPeriod,
      contractStart:      this.contractStart,
    };

    this.svc.updateDetails(this.tenant.id, dto).subscribe({
      next: updated => {
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 2500);
        this.closed.emit(updated);
      },
      error: () => this.saving.set(false),
    });
  }

  resetPassword(): void {
    if (this.resetting()) return;
    this.resetting.set(true);
    this.newPassword.set(null);
    this.svc.resetPassword(this.tenant.id).subscribe({
      next: res => { this.newPassword.set(res); this.resetting.set(false); },
      error: ()  => this.resetting.set(false),
    });
  }

  copyPassword(): void {
    const pw = this.newPassword()?.password;
    if (pw) navigator.clipboard.writeText(pw);
  }

  close(): void { this.closed.emit(this.latestTenant); }

  // ── Add-ons nachträglich buchen/entfernen ────────────────────────────────
  hasAddon(key: string): boolean {
    return this.tenant.addons.includes(key);
  }

  toggleAddon(key: string): void {
    if (this.addonSaving()) return;
    const active = !this.hasAddon(key);
    this.addonSaving.set(key);

    this.svc.updateAddon(this.tenant.id, key, active).subscribe({
      next: updated => {
        this.latestTenant  = updated;
        this.tenant.addons = updated.addons;
        this.addonSaving.set(null);
      },
      error: () => this.addonSaving.set(null),
    });
  }

  planLabel(): string {
    return { tisch: 'Tisch', menu: 'Menü', maitre: 'Maître' }[this.tenant.plan] ?? this.tenant.plan;
  }

  planPrice(): string | null {
    const p = this.prices();
    if (!p) return null;
    const cents = p[this.tenant.plan];
    if (cents == null) return null;
    return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' € / Monat';
  }

  /** Endsumme: Grundpreis, bei monatlicher Vertragsdauer +10% Aufpreis (spiegelt den Preis-Switch im Admin-Bereich). */
  readonly MONTHLY_SURCHARGE = 1.10;

  private planBaseCents(): number | null {
    return this.prices()?.[this.tenant.plan] ?? null;
  }

  endsumme(): string | null {
    const base = this.planBaseCents();
    if (base == null) return null;
    const cents = this.contractDuration === 'monthly' ? Math.round(base * this.MONTHLY_SURCHARGE) : base;
    return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' € / Monat';
  }
}
