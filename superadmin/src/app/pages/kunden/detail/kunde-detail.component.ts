import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Tenant, TenantDetailsDto } from '../../../services/tenants.service';
import { TenantsService } from '../../../services/tenants.service';

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

  private readonly svc = inject(TenantsService);

  saving        = signal(false);
  saved         = signal(false);
  resetting     = signal(false);
  newPassword   = signal<{ email: string; password: string } | null>(null);
  activeTab     = signal<'allgemein' | 'vertrag' | 'adresse' | 'rechnung' | 'notizen'>('allgemein');

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

  ngOnChanges(): void {
    if (!this.tenant) return;
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

  close(): void { this.closed.emit(null); }

  planLabel(): string {
    return { tisch: 'Tisch', menu: 'Menü', maitre: 'Maître' }[this.tenant.plan] ?? this.tenant.plan;
  }
}
