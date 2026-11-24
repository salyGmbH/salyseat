import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

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

/** Bereits bestehende Reservierung, die von einer neu angelegten Sperre betroffen ist. */
export interface AffectedReservation {
  id: string;
  guest_name: string;
  guest_first_name: string | null;
  party_size: number;
  starts_at: string;
  table_number: number | null;
}

interface CreateVenueBlockApiResponse extends VenueBlock {
  affected_reservations_count: number;
  affected_reservations: AffectedReservation[];
}

export interface CreateBlockResult {
  block: VenueBlock;
  affected: AffectedReservation[];
}

@Injectable({ providedIn: 'root' })
export class RoomBlocksService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/venues';

  getBlocks(venueId: string): Observable<VenueBlock[]> {
    return this.http.get<VenueBlock[]>(`${this.base}/${venueId}/blocks`);
  }

  /**
   * Legt eine neue Raumsperre an. Die Antwort enthält zusätzlich alle bereits
   * bestehenden, noch relevanten Reservierungen, die in das Sperrfenster
   * fallen — diese werden dabei NICHT automatisch storniert, sondern dienen
   * nur als Hinweis für die Verwaltung.
   */
  createBlock(venueId: string, dto: CreateVenueBlockDto): Observable<CreateBlockResult> {
    return this.http.post<CreateVenueBlockApiResponse>(`${this.base}/${venueId}/blocks`, dto).pipe(
      map(res => ({
        block: {
          id:        res.id,
          date_from: res.date_from,
          date_to:   res.date_to,
          reason:    res.reason,
          full_day:  res.full_day,
          time_from: res.time_from,
          time_to:   res.time_to,
        },
        affected: res.affected_reservations ?? [],
      })),
    );
  }

  deleteBlock(venueId: string, blockId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${venueId}/blocks/${blockId}`);
  }
}
