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
  cancellation_count: number;
  cancellation_rate: number;
  last_visit_at: string | null;  // 'YYYY-MM-DD'
  blocked: boolean;
  blocked_reason: string | null;
  internal_notes: string | null;
  allergies: string | null;
  gasttypen: string[];
  hinweise: string[];
  allergene: string[];
  birthday: string | null;       // 'YYYY-MM-DD'
  wedding_date: string | null;   // 'YYYY-MM-DD'
  total_revenue_cents: number;
  created_at: string;
}

export interface GuestReservation {
  id: string;
  starts_at: string;  // 'YYYY-MM-DD HH:mm'
  ends_at: string;
  party_size: number;
  status: string;
  table_number: number | null;
  guest_notes: string | null;
  admin_notes: string | null;
  venue_name: string;
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
  allergies?: string | null;
  blocked?: boolean;
  blocked_reason?: string;
  gasttypen?: string[];
  hinweise?: string[];
  allergene?: string[];
  birthday?: string | null;
  wedding_date?: string | null;
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

  loadReservations(guestId: string, upcomingOnly = false): Observable<{ reservations: GuestReservation[]; avg_party_size: number }> {
    let qp = new HttpParams();
    if (upcomingOnly) qp = qp.set('upcoming', '1');
    return this.http.get<{ reservations: GuestReservation[]; avg_party_size: number }>(
      `${this.base}/${guestId}/reservations`, { params: qp }
    ).pipe(catchError(() => of({ reservations: [], avg_party_size: 0 })));
  }

  resendEmail(
    guestId: string,
    type: 'confirmation' | 'reminder' | 'cancel' | 'no_show',
    reservationId?: string,
  ): Observable<{ sent: boolean; type: string; to: string }> {
    return this.http.post<{ sent: boolean; type: string; to: string }>(
      `${this.base}/${guestId}/resend-email`,
      { type, reservation_id: reservationId ?? '' },
    );
  }
}
