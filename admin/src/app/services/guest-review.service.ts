import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, tap } from 'rxjs';

export interface GuestReview {
  id: string;
  guestName: string;
  ratingService:  number | null;
  ratingFood:     number | null;
  ratingAmbiance: number | null;
  ratingValue:    number | null;
  comment: string | null;
  submittedAt: string | null;
  read: boolean;
}

@Injectable({ providedIn: 'root' })
export class GuestReviewService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/guest-reviews';

  private readonly _reviews = signal<GuestReview[]>([]);
  private readonly _loading = signal(false);
  private readonly _unreadCount = signal(0);

  readonly reviews      = computed(() => this._reviews());
  readonly loading      = computed(() => this._loading());
  readonly unreadCount  = computed(() => this._unreadCount());

  constructor() {
    this.refreshUnreadCount().subscribe();
  }

  load(): Observable<GuestReview[]> {
    this._loading.set(true);
    return this.http.get<GuestReview[]>(this.base).pipe(
      tap(reviews => {
        this._reviews.set(reviews);
        this._loading.set(false);
      }),
      catchError(() => {
        this._loading.set(false);
        return of([]);
      }),
    );
  }

  refreshUnreadCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.base}/unread-count`).pipe(
      tap(res => this._unreadCount.set(res.count)),
      catchError(() => of({ count: 0 })),
    );
  }

  markRead(id: string): Observable<GuestReview> {
    return this.http.patch<GuestReview>(`${this.base}/${id}/read`, {}).pipe(
      tap(updated => {
        this._reviews.update(rs => rs.map(r => r.id === id ? updated : r));
        this._unreadCount.update(c => Math.max(0, c - 1));
      }),
    );
  }
}