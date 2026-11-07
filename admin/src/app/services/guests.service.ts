import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

export interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  total_reservations: number;
  no_show_count: number;
  reliability_score: number;
  blocked: boolean;
  blocked_reason: string | null;
  internal_notes: string | null;
  gasttypen: string[];
  hinweise: string[];
  created_at: string;
}

export interface GuestListResponse {
  guests: Guest[];
  total: number;
  limit: number;
  offset: number;
}

export interface UpdateGuestDto {
  name?: string;
  email?: string | null;
  phone?: string | null;
  internal_notes?: string | null;
  blocked?: boolean;
  blocked_reason?: string;
  gasttypen?: string[];
  hinweise?: string[];
}

@Injectable({ providedIn: 'root' })
export class GuestsService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/guests';

  load(params: { search?: string; limit?: number; offset?: number } = {}): Observable<GuestListResponse> {
    let qp = new HttpParams();
    if (params.search)  qp = qp.set('search', params.search);
    if (params.limit)   qp = qp.set('limit',  String(params.limit));
    if (params.offset)  qp = qp.set('offset', String(params.offset));

    return this.http.get<GuestListResponse>(this.base, { params: qp }).pipe(
      catchError(() => of({ guests: [], total: 0, limit: 100, offset: 0 }))
    );
  }

  update(id: string, dto: UpdateGuestDto): Observable<Guest> {
    return this.http.patch<Guest>(`${this.base}/${id}`, dto);
  }
}
