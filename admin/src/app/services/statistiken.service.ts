import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

export interface StatsTimeslot {
  time: string;
  count: number;
  guests: number;
}

export interface StatsMonthly {
  month: string;
  count: number;
  guests: number;
}

export interface StatsTotals {
  reservations: number;
  guests: number;
  noShows: number;
  auslastung: number;
}

export interface StatsTopGuest {
  name: string;
  visits: number;
  noShows: number;
  reliabilityScore: number;
  blocked: boolean;
}

export interface StatisticsOverview {
  totals: StatsTotals;
  timeslots: StatsTimeslot[];
  monthly: StatsMonthly[];
  topGuests: StatsTopGuest[];
}

const EMPTY: StatisticsOverview = {
  totals:    { reservations: 0, guests: 0, noShows: 0, auslastung: 0 },
  timeslots: [],
  monthly:   [],
  topGuests: [],
};

@Injectable({ providedIn: 'root' })
export class StatistikenService {
  private readonly http = inject(HttpClient);

  load(from?: string, to?: string): Observable<StatisticsOverview> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to)   params['to']   = to;
    return this.http
      .get<StatisticsOverview>('/api/v1/admin/stats/overview', { params })
      .pipe(catchError(() => of(EMPTY)));
  }
}
