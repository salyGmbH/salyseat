import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type WaitlistEntryStatus = 'waiting' | 'notified' | 'converted' | 'cancelled';

export interface WaitlistEntry {
  id: string;
  status: WaitlistEntryStatus;
  venue_id: string;
  venue_name: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  notes: string | null;
  party_size: number;
  requested_at: string;
  created_at: string;
}

export interface WaitlistListResponse {
  entries: WaitlistEntry[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable({ providedIn: 'root' })
export class WaitlistService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/waitlist';

  list(status?: WaitlistEntryStatus, venueId?: string): Observable<WaitlistListResponse> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (venueId) params.set('venue_id', venueId);
    const qs = params.toString();
    return this.http.get<WaitlistListResponse>(`${this.base}${qs ? '?' + qs : ''}`);
  }

  updateStatus(id: string, status: WaitlistEntryStatus): Observable<{ ok: boolean; entry: WaitlistEntry }> {
    return this.http.patch<{ ok: boolean; entry: WaitlistEntry }>(`${this.base}/${id}/status`, { status });
  }
}