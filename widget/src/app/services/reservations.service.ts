import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

import { environment } from '../../environments/environment';

export interface WidgetVenue {
  id: string;
  name: string;
  category: string;
  address: string | null;
}

export interface WidgetDesignConfig {
  layout:           string;
  imageUrl:         string | null;
  headingTitle:     string;
  headingSubtitle:  string;
  headingAlignment: string;
  showSubtitle:     boolean;
  fontFamily:       string;
  fontSize:         string;
  colorPrimary:     string;
  colorText:        string;
  colorBackground:  string;
  buttonLabel:      string;
  cornerRadius:     string;
}

export interface WidgetFunctionalConfig {
  intervall:               number;
  speisekarte:             boolean;
  speisekarteType:         string;
  speisekarteUrl:          string;
  speisekartePdfName:      string;
  ausstehendBestaetigung:  boolean;
  raumauswahl:             boolean;
  raumauswahlAktiveIds:    string[];
  hinweistext:             boolean;
  hinweistextUeberschrift: string;
  hinweistextInhalt:       string;
  hinweistextFooter:       string;
  pflichtfelder:           string[];
  maxPersonen:             number;
  maxPersonenText:         string;
  maxPersonenPhone:        string;
  maxPersonenEmail:        string;
  kinderStuehleAktiv:      boolean;
  kinderStuehleGesamt:     number;
  kinderStuehleOnline:     number;
  vorausbuchungEinheit:    string;
  vorausbuchungWert:       number;
  mindestvorlaufMinuten:   number;
  tischartenAktiv:         boolean;
  tischartenAktiveTypes:   string[];
  onlineAenderungen:       boolean;
  onlineAenderungenMinuten: number;
  onlineStornierung:       boolean;
  onlineStornierungMinuten: number;
}

export interface WidgetConfig {
  name:              string;
  venues:            WidgetVenue[];
  widgetDesign:      WidgetDesignConfig      | null;
  widgetFunctional:  WidgetFunctionalConfig  | null;
}

export interface CreateReservationPayload {
  venue_id:    string;
  guest_name:  string;
  guest_email: string;
  guest_phone?: string;
  party_size:  number;
  starts_at:   string;
  notes?:      string;
}

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

export interface Break {
  from: string;
  to: string;
}

export interface DayAvailability {
  open: boolean;
  open_time: string | null;
  close_time: string | null;
  breaks: Break[];
  reason: string | null;
}

@Injectable({ providedIn: 'root' })
export class ReservationsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/widget/reservations`;
  private readonly availBase = `${environment.apiUrl}/widget/availability`;

  loadConfig(publicKey: string): Observable<WidgetConfig> {
    return this.http.get<WidgetConfig>(`${this.base}/config/${publicKey}`).pipe(
      catchError(() => of({ name: 'Restaurant', venues: [], widgetDesign: null, widgetFunctional: null }))
    );
  }

  checkAvailability(venueId: string, date: string): Observable<DayAvailability> {
    return this.http.get<DayAvailability>(`${this.availBase}?venue_id=${venueId}&date=${date}`).pipe(
      catchError(() => of({ open: true, open_time: null, close_time: null, breaks: [], reason: null }))
    );
  }

  create(payload: CreateReservationPayload): Observable<CreateReservationResponse> {
    return this.http.post<CreateReservationResponse>(this.base, payload);
  }
}

// ─── Helfer: Datum + Uhrzeit → ATOM-String (mit lokalem TZ-Offset) ────────
export function toAtomDateTime(date: string, time: string): string {
  const local = new Date(`${date}T${time}:00`);
  const offsetMinutes = -local.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${date}T${time}:00${sign}${hh}:${mm}`;
}
