import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PeriodStats {
  total: number;
  guests: number;
  pending: number;
  confirmed: number;
  seated: number;
  seated_guests: number;
  cancelled: number;
  no_show: number;
  completed: number;
}

export interface DashboardStats {
  today: PeriodStats;
  tomorrow: PeriodStats;
  week: PeriodStats;
  venues: number;
  // Optional — werden vom Backend später befüllt
  free_seats?:     number;
  total_capacity?: number;
  revenue_today?:  number;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/stats';

  load(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(this.base);
  }
}
