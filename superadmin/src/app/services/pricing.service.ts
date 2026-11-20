import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface PlanPrices {
  tisch:  number;
  menu:   number;
  maitre: number;
}

@Injectable({ providedIn: 'root' })
export class PricingService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/superadmin';

  getPrices() {
    return this.http.get<PlanPrices>(`${this.base}/pricing`);
  }

  updatePrices(prices: PlanPrices) {
    return this.http.patch<PlanPrices>(`${this.base}/pricing`, prices);
  }
}
