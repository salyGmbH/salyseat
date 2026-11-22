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

export interface StatsLeadTime {
  lastMinute: number; lastMinutePercent: number;
  shortTerm:  number; shortTermPercent:  number;
  planned:    number; plannedPercent:    number;
  longTerm:   number; longTermPercent:   number;
}

export interface StatsHeatmapRow {
  weekday: string;
  values: number[];
}

export interface StatsGroupHeatmap {
  labels: string[];
  rows: StatsHeatmapRow[];
}

export interface StatsWaitlistInsight {
  total: number;
  converted: number;
  missed: number;
  missedGuests: number;
  conversionRate: number | null;
}

export interface StatsTopPackageInsight {
  name: string;
  quantity: number;
}

export interface StatsMismatchInsight {
  bucket: string;
  demand: number;
  tableCount: number;
}

export interface StatsGrowthInsight {
  current: number;
  previous: number;
  growthPercent: number | null;
}

export interface StatsInsights {
  waitlist: StatsWaitlistInsight;
  topPackage: StatsTopPackageInsight | null;
  mismatch: StatsMismatchInsight | null;
  growth: StatsGrowthInsight | null;
}

export interface StatisticsOverview {
  totals: StatsTotals;
  timeslots: StatsTimeslot[];
  monthly: StatsMonthly[];
  topGuests: StatsTopGuest[];
  guestTypes: StatsGuestTypes;
  sources: StatsSources;
  leadTime: StatsLeadTime;
  groupHeatmap: StatsGroupHeatmap;
  insights: StatsInsights;
}

const EMPTY: StatisticsOverview = {
  totals:       { reservations: 0, guests: 0, noShows: 0, auslastung: 0 },
  timeslots:    [],
  monthly:      [],
  topGuests:    [],
  guestTypes:   { new: 0, returning: 0, newPercent: 0, returningPercent: 0 },
  sources:      { online: 0, onlinePercent: 0, walkIn: 0, walkInPercent: 0, admin: 0, adminPercent: 0 },
  leadTime:     { lastMinute: 0, lastMinutePercent: 0, shortTerm: 0, shortTermPercent: 0, planned: 0, plannedPercent: 0, longTerm: 0, longTermPercent: 0 },
  groupHeatmap: { labels: [], rows: [] },
  insights:     {
    waitlist:   { total: 0, converted: 0, missed: 0, missedGuests: 0, conversionRate: null },
    topPackage: null,
    mismatch:   null,
    growth:     null,
  },
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
