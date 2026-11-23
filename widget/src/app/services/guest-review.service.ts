import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GuestReviewContext {
  venueName: string;
  guestName: string;
  alreadySubmitted: boolean;
}

export interface SubmitGuestReviewDto {
  ratingService: number;
  ratingFood: number;
  ratingAmbiance: number;
  ratingValue: number;
  comment?: string;
}

@Injectable({ providedIn: 'root' })
export class GuestReviewService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/widget/guest-reviews`;

  getContext(token: string): Observable<GuestReviewContext> {
    return this.http.get<GuestReviewContext>(`${this.base}/${token}`);
  }

  submit(token: string, dto: SubmitGuestReviewDto): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/${token}`, dto);
  }
}