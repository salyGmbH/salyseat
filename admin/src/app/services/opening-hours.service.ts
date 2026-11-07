import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DayHours {
  weekday: number;
  open: boolean;
  open_time: string | null;
  close_time: string | null;
  breaks: { from: string; to: string }[];
}

export interface SpecialClosing {
  id: string;
  date_from: string;
  date_to: string;
  reason: string | null;
  full_day: boolean;
  open_time: string | null;
  close_time: string | null;
}

export interface CreateSpecialClosingDto {
  date_from: string;
  date_to: string;
  reason?: string;
  full_day: boolean;
  open_time?: string;
  close_time?: string;
}

@Injectable({ providedIn: 'root' })
export class OpeningHoursService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/venues';

  getHours(venueId: string): Observable<DayHours[]> {
    return this.http.get<DayHours[]>(`${this.base}/${venueId}/opening-hours`);
  }

  saveHours(venueId: string, days: DayHours[]): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(`${this.base}/${venueId}/opening-hours`, days);
  }

  getSpecialClosings(venueId: string): Observable<SpecialClosing[]> {
    return this.http.get<SpecialClosing[]>(`${this.base}/${venueId}/special-closings`);
  }

  createSpecialClosing(venueId: string, dto: CreateSpecialClosingDto): Observable<SpecialClosing> {
    return this.http.post<SpecialClosing>(`${this.base}/${venueId}/special-closings`, dto);
  }

  deleteSpecialClosing(venueId: string, closingId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${venueId}/special-closings/${closingId}`);
  }
}