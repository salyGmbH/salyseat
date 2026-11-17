import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TenantsService, Tenant, CreateTenantDto } from '../../../services/tenants.service';

const ALL_ADDONS = [
  { key: 'vouchers',    label: 'Gutscheine',     icon: 'card_giftcard' },
  { key: 'speisekarte', label: 'Speisekarte',    icon: 'menu_book' },
  { key: 'pms',         label: 'Hotel-PMS',      icon: 'hotel' },
  { key: 'pos',         label: 'Kassenschnittst.', icon: 'point_of_sale' },
];

@Component({
  selector: 'app-kunde-neu',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: './kunde-neu.component.html',
  styleUrl: './kunde-neu.component.scss',
})
export class KundeNeuComponent {
  @Output() closed = new EventEmitter<Tenant | null>();

  private readonly svc = inject(TenantsService);

  saving   = signal(false);
  error    = signal('');
  activeTab = signal<'allgemein' | 'adresse' | 'rechnung' | 'zugangsdaten'>('allgemein');

  readonly addons = ALL_ADDONS;

  readonly contractDurations = [
    { key: 'monthly', label: 'Monatlich',       desc: '1 Monat' },
    { key: 'yearly',  label: 'Jahresvertrag',   desc: '12 Monate' },
    { key: '2yearly', label: '2-Jahresvertrag', desc: '24 Monate' },
  ];

  readonly cancellationPeriods = [
    { key: '14days',  label: '14 Tage' },
    { key: '30days',  label: '1 Monat' },
    { key: '3months', label: '3 Monate' },
  ];

  readonly plans  = [
    { key: 'tisch',  label: 'Tisch',  desc: 'Grundpaket' },
    { key: 'menu',   label: 'Menü',   desc: 'Inkl. Notizen & E-Mail-Design' },
    { key: 'maitre', label: 'Maître', desc: 'Vollumfänglich' },
  ];

  // Fields
  name          = '';
  plan          = 'tisch';
  selectedAddons: string[] = [];
  contactEmail  = '';
  contactPhone  = '';
  street        = '';
  zip           = '';
  city          = '';
  country       = 'Deutschland';
  billCompany   = '';
  billVatId     = '';
  billStreet    = '';
  billZip       = '';
  billCity      = '';
  billCountry   = 'Deutschland';
  adminEmail    = '';
  adminPassword = '';
  internalNotes      = '';
  contractDuration   = '';
  cancellationPeriod = '';
  contractStart      = '';

  toggleAddon(key: string): void {
    this.selectedAddons = this.selectedAddons.includes(key)
      ? this.selectedAddons.filter(a => a !== key)
      : [...this.selectedAddons, key];
  }

  hasAddon(key: string): boolean {
    return this.selectedAddons.includes(key);
  }

  save(): void {
    if (!this.name.trim() || !this.adminEmail.trim() || !this.adminPassword.trim()) {
      this.error.set('Name, Login-E-Mail und Passwort sind Pflichtfelder.');
      return;
    }
    this.saving.set(true);
    this.error.set('');

    const dto: CreateTenantDto = {
      name:          this.name.trim(),
      adminEmail:    this.adminEmail.trim(),
      adminPassword: this.adminPassword,
      plan:          this.plan,
      addons:        this.selectedAddons,
      contactEmail:  this.contactEmail,
      contactPhone:  this.contactPhone,
      address:       { street: this.street, zip: this.zip, city: this.city, country: this.country },
      billingAddress:{ companyName: this.billCompany, vatId: this.billVatId, street: this.billStreet, zip: this.billZip, city: this.billCity, country: this.billCountry },
      internalNotes:     this.internalNotes,
      contractDuration:   this.contractDuration,
      cancellationPeriod: this.cancellationPeriod,
      contractStart:      this.contractStart,
    };

    this.svc.createTenant(dto).subscribe({
      next: created => { this.saving.set(false); this.closed.emit(created); },
      error: err => {
        this.saving.set(false);
        this.error.set(err.error?.error ?? 'Fehler beim Anlegen.');
      },
    });
  }

  close(): void { this.closed.emit(null); }
}
