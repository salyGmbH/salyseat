import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export type Plan = 'tisch' | 'menu' | 'maitre';

export interface AddOn {
  id: string;
  key: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  minPlan: Plan | null;
  includedFromPlan: Plan | null;
  icon: string;
  status: 'active' | 'soon';
  sortOrder: number;
  createdAt: string;
}

export interface CreateAddOnDto {
  key: string;
  name: string;
  description?: string;
  priceCents?: number | null;
  minPlan?: Plan | null;
  includedFromPlan?: Plan | null;
  icon?: string;
  status?: 'active' | 'soon';
  sortOrder?: number;
}

export type UpdateAddOnDto = Omit<CreateAddOnDto, 'key'>;

@Injectable({ providedIn: 'root' })
export class AddonsService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/superadmin/addons';

  list() {
    return this.http.get<AddOn[]>(this.base);
  }

  create(dto: CreateAddOnDto) {
    return this.http.post<AddOn>(this.base, dto);
  }

  update(id: string, dto: UpdateAddOnDto) {
    return this.http.patch<AddOn>(`${this.base}/${id}`, dto);
  }

  delete(id: string) {
    return this.http.delete<{ deleted: boolean }>(`${this.base}/${id}`);
  }
}