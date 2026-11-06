import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { Reservation, ReservationListResponse } from './reservation.types';

@Injectable({ providedIn: 'root' })
export class ReservationsService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/reservations';

  private readonly _reservations = signal<Reservation[]>([]);
  private readonly _total        = signal(0);
  private readonly _loading      = signal(false);

  readonly reservations = computed(() => this._reservations());
  readonly total        = computed(() => this._total());
  readonly loading      = computed(() => this._loading());

  load(params: { status?: string; date?: string; limit?: number; offset?: number } = {}): Observable<ReservationListResponse> {
    this._loading.set(true);

    let qp = new HttpParams();
    if (params.status) qp = qp.set('status', params.status);
    if (params.date)   qp = qp.set('date',   params.date);
    if (params.limit)  qp = qp.set('limit',  String(params.limit));
    if (params.offset) qp = qp.set('offset', String(params.offset));

    return this.http.get<ReservationListResponse>(this.base, { params: qp }).pipe(
      tap(res => {
        this._reservations.set(res.reservations);
        this._total.set(res.total);
        this._loading.set(false);
      }),
      catchError(() => {
        this._loading.set(false);
        return of({ reservations: [], total: 0, limit: 50, offset: 0 });
      }),
    );
  }

  confirm(id: string): Observable<Reservation> {
    return this.http.patch<Reservation>(`${this.base}/${id}/confirm`, {}).pipe(
      tap(updated => this._reservations.update(rs => rs.map(r => r.id === id ? updated : r))),
    );
  }

  markNoShow(id: string): Observable<Reservation> {
    return this.http.patch<Reservation>(`${this.base}/${id}/no-show`, {}).pipe(
      tap(updated => this._reservations.update(rs => rs.map(r => r.id === id ? updated : r))),
    );
  }

  cancel(id: string): Observable<Reservation> {
    return this.http.patch<Reservation>(`${this.base}/${id}/cancel`, {}).pipe(
      tap(updated => this._reservations.update(rs => rs.map(r => r.id === id ? updated : r))),
    );
  }

  update(id: string, payload: {
    guest_name?: string;
    party_size?: number;
    starts_at?: string;
    duration_minutes?: number;
    guest_phone?: string;
    notes?: string;
  }): Observable<Reservation> {
    return this.http.patch<Reservation>(`${this.base}/${id}`, payload).pipe(
      tap(updated => this._reservations.update(rs => rs.map(r => r.id === id ? updated : r))),
    );
  }

  loadForVenue(venueId: string, date: string): Observable<Reservation[]> {
    const qp = new HttpParams().set('date', date).set('limit', '200');
    return this.http.get<ReservationListResponse>(this.base, { params: qp }).pipe(
      map(res => res.reservations.filter(r => r.venue_id === venueId)),
      catchError(() => of([])),
    );
  }

  create(payload: {
    venue_id: string;
    guest_name: string;
    guest_email?: string;
    guest_phone?: string;
    party_size: number;
    starts_at: string;
    notes?: string;
  }): Observable<Reservation> {
    return this.http.post<Reservation>(this.base, payload);
  }
}
