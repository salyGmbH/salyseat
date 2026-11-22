import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/calendar';

  getFeedUrl(): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.base}/feed-url`);
  }

  regenerate(): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.base}/regenerate`, {});
  }
}
