import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

/** Payload, das das Widget ans Backend schickt. */
export interface CreateReservationPayload {
  venue_id:    string;
  guest_name:  string;
  guest_email: string;
  guest_phone?: string;
  party_size:  number;
  /** ATOM-Format mit Timezone, z.B. 2026-11-29T19:00:00+02:00 */
  starts_at:   string;
  notes?:      string;
}

/** Antwort des Backends nach erfolgreicher Erstellung. */
export interface CreateReservationResponse {
  reservation: {
    id:         string;
    venue_id:   string;
    guest_name: string;
    party_size: number;
    starts_at:  string;
    ends_at:    string;
    status:     string;
    [key: string]: unknown;
  };
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ReservationsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/widget/reservations`;

  create(payload: CreateReservationPayload): Observable<CreateReservationResponse> {
    return this.http.post<CreateReservationResponse>(this.base, payload);
  }
}

// ─── Helfer: Datum + Uhrzeit → ATOM-String (mit lokalem TZ-Offset) ────────
//
// Das Backend validiert starts_at strikt im ATOM-Format (Y-m-d\TH:i:sP),
// also brauchen wir den Timezone-Offset hinten dran (z.B. +02:00).
export function toAtomDateTime(date: string, time: string): string {
  // date = "2026-11.05", time = "19:00"
  const local = new Date(`${date}T${time}:00`);
  const offsetMinutes = -local.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${date}T${time}:00${sign}${hh}:${mm}`;
}
