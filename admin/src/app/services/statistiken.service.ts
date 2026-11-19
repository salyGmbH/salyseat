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

export interface StatsGuestTypes {
  new: number;
  returning: number;
  newPercent: number;
  returningPercent: number;
}

export interface StatsSources {
  online: number;  onlinePercent: number;
  walkIn: number;  walkInPercent: number;
  admin: number;   adminPercent: number;
}

export interface StatisticsOverview {
  totals: StatsTotals;
  timeslots: StatsTimeslot[];
  monthly: StatsMonthly[];
  topGuests: StatsTopGuest[];
  guestTypes: StatsGuestTypes;
  sources: StatsSources;
}

const EMPTY: StatisticsOverview = {
  totals:     { reservations: 0, guests: 0, noShows: 0, auslastung: 0 },
  timeslots:  [],
  monthly:    [],
  topGuests:  [],
  guestTypes: { new: 0, returning: 0, newPercent: 0, returningPercent: 0 },
  sources:    { online: 0, onlinePercent: 0, walkIn: 0, walkInPercent: 0, admin: 0, adminPercent: 0 },
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
