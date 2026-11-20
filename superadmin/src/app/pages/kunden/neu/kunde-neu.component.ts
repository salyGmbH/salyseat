import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TenantsService, Tenant, CreateTenantDto } from '../../../services/tenants.service';
import { AddonsService } from '../../../services/addons.service';

@Component({
  selector: 'app-kunde-neu',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: './kunde-neu.component.html',
  styleUrl: './kunde-neu.component.scss',
})
export class KundeNeuComponent implements OnInit {
  @Output() closed = new EventEmitter<Tenant | null>();

  private readonly svc        = inject(TenantsService);
  private readonly addonsSvc  = inject(AddonsService);

  saving   = signal(false);
  error    = signal('');
  activeTab = signal<'allgemein' | 'adresse' | 'rechnung' | 'zugangsdaten'>('allgemein');

  /** Add-on-Katalog, dynamisch von /api/v1/superadmin/addons geladen, damit hier nie eine
   *  hartcodierte Liste veraltet, wenn ein neues Add-on angelegt wird. */
  readonly addons = signal<{ key: string; label: string; icon: string }[]>([]);

  ngOnInit(): void {
    this.addonsSvc.list().subscribe({
      next: list => this.addons.set(list.map(a => ({ key: a.key, label: a.name, icon: a.icon }))),
      error: () => { /* Katalog bleibt leer — Add-on-Auswahl zeigt dann nichts an */ },
    });
  }

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
