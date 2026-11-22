import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface Address {
  street:  string;
  zip:     string;
  city:    string;
  country: string;
}

export interface BillingAddress extends Address {
  companyName: string;
  vatId:       string;
}

export interface Tenant {
  id:             string;
  name:           string;
  slug:           string;
  plan:           'tisch' | 'menu' | 'maitre';
  active:         boolean;
  addons:         string[];
  createdAt:          string;
  adminEmail:         string | null;
  contactEmail:       string | null;
  contactPhone:       string | null;
  address:            Address | null;
  billingAddress:     BillingAddress | null;
  internalNotes:      string | null;
  contractDuration:   string | null;
  cancellationPeriod: string | null;
  contractStart:      string | null;
}

export interface CreateTenantDto {
  name:               string;
  adminEmail:         string;
  adminPassword:      string;
  plan:               string;
  addons:             string[];
  contactEmail:       string;
  contactPhone:       string;
  address:            Address;
  billingAddress:     BillingAddress;
  internalNotes:      string;
  contractDuration:   string;
  cancellationPeriod: string;
  contractStart:      string;
}

export interface TenantDetailsDto {
  name:               string;
  contactEmail:       string;
  contactPhone:       string;
  address:            Address;
  billingAddress:     BillingAddress;
  internalNotes:      string;
  contractDuration:   string;
  cancellationPeriod: string;
  contractStart:      string;
}

export interface PlatformStats {
  totalTenants:  number;
  activeTenants: number;
  newLast30Days: number;
  byPlan:        Record<string, number>;
}

export interface WhatsAppConfig {
  phoneNumberId?: string;
  channelId?:     string;
  apiKey?:        string;
  baseUrl?:       string;
}

@Injectable({ providedIn: 'root' })
export class TenantsService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/superadmin';

  list() {
    return this.http.get<Tenant[]>(`${this.base}/tenants`);
  }

  get(id: string) {
    return this.http.get<Tenant>(`${this.base}/tenants/${id}`);
  }

  stats() {
    return this.http.get<PlatformStats>(`${this.base}/stats`);
  }

  updatePlan(id: string, plan: string) {
    return this.http.patch<Tenant>(`${this.base}/tenants/${id}/plan`, { plan });
  }

  updateAddon(id: string, key: string, active: boolean) {
    return this.http.patch<Tenant>(`${this.base}/tenants/${id}/addon`, { key, active });
  }

  updateStatus(id: string, active: boolean) {
    return this.http.patch<Tenant>(`${this.base}/tenants/${id}/status`, { active });
  }

  updateDetails(id: string, dto: TenantDetailsDto) {
    return this.http.patch<Tenant>(`${this.base}/tenants/${id}/details`, dto);
  }

  resetPassword(id: string) {
    return this.http.post<{ email: string; password: string }>(
      `${this.base}/tenants/${id}/reset-password`, {}
    );
  }

  createTenant(dto: CreateTenantDto) {
    return this.http.post<Tenant>(`${this.base}/tenants`, dto);
  }

  getWhatsappConfig(id: string) {
    return this.http.get<WhatsAppConfig>(`${this.base}/tenants/${id}/whatsapp`);
  }

  saveWhatsappConfig(id: string, dto: WhatsAppConfig) {
    return this.http.put<{ saved: boolean }>(`${this.base}/tenants/${id}/whatsapp`, dto);
  }
}
