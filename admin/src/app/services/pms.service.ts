import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

export interface PmsConfig {
  provider?: string;
  clientToken?: string;
  accessToken?: string;
  serviceId?: string;
  resourceCategoryId?: string;
  rateId?: string;
  ageCategoryId?: string;
  baseUrl?: string;
}

export interface PmsGuest {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  number: string;
  checkIn?: string;
  checkOut?: string;
  roomNumber?: string | null;
  adultCount?: number;
  childCount?: number;
  hasBreakfast?: boolean;
  nationalityCode?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PmsService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/pms';

  status(): Observable<{ enabled: boolean }> {
    return this.http.get<{ enabled: boolean }>(`${this.base}/status`).pipe(
      catchError(() => of({ enabled: false }))
    );
  }

  searchGuests(query: string): Observable<{ guests: PmsGuest[] }> {
    const params = new HttpParams().set('q', query);
    return this.http.get<{ guests: PmsGuest[] }>(`${this.base}/guests/search`, { params });
  }

  getInHouseGuests(): Observable<{ guests: PmsGuest[] }> {
    return this.http.get<{ guests: PmsGuest[] }>(`${this.base}/guests/inhouse`);
  }

  getConfig(): Observable<PmsConfig> {
    return this.http.get<PmsConfig>(`${this.base}/config`);
  }

  saveConfig(config: PmsConfig): Observable<{ saved: boolean }> {
    return this.http.put<{ saved: boolean }>(`${this.base}/config`, config);
  }
}
