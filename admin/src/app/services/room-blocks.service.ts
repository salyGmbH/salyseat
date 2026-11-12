import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface VenueBlock {
  id: string;
  date_from: string;
  date_to: string;
  reason: string | null;
  full_day: boolean;
  time_from: string | null;
  time_to: string | null;
}

export interface CreateVenueBlockDto {
  date_from: string;
  date_to: string;
  reason?: string;
  full_day: boolean;
  time_from?: string;
  time_to?: string;
}

@Injectable({ providedIn: 'root' })
export class RoomBlocksService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/venues';

  getBlocks(venueId: string): Observable<VenueBlock[]> {
    return this.http.get<VenueBlock[]>(`${this.base}/${venueId}/blocks`);
  }

  createBlock(venueId: string, dto: CreateVenueBlockDto): Observable<VenueBlock> {
    return this.http.post<VenueBlock>(`${this.base}/${venueId}/blocks`, dto);
  }

  deleteBlock(venueId: string, blockId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${venueId}/blocks/${blockId}`);
  }
}