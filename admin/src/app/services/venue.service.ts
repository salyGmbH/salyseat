import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import { Venue, VenueLayout, CreateVenueDto, UpdateVenueDto } from './venue.types';
import { PlacedTable, PlacedWall } from './room.types';

@Injectable({ providedIn: 'root' })
export class VenueService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/venues';

  private readonly _venues = signal<Venue[]>([]);
  private readonly _loaded = signal(false);

  readonly venues  = computed(() => this._venues());
  readonly loaded  = computed(() => this._loaded());

  // ── Laden ────────────────────────────────────────────────────────────────
  load(): Observable<{ venues: Venue[] }> {
    return this.http.get<{ venues: Venue[] }>(this.base).pipe(
      tap(res => {
        this._venues.set(res.venues);
        this._loaded.set(true);
      }),
      catchError(() => {
        this._loaded.set(true);
        return of({ venues: [] });
      }),
    );
  }

  getById(id: string): Venue | undefined {
    return this._venues().find(v => v.id === id);
  }

  // ── CRUD ────────────────────────────────────────────────────────────────
  create(dto: CreateVenueDto): Observable<Venue> {
    return this.http.post<Venue>(this.base, dto).pipe(
      tap(venue => this._venues.update(vs => [...vs, venue])),
    );
  }

  update(id: string, dto: UpdateVenueDto): Observable<Venue> {
    return this.http.patch<Venue>(`${this.base}/${id}`, dto).pipe(
      tap(updated => this._venues.update(vs => vs.map(v => v.id === id ? updated : v))),
    );
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(
      tap(() => this._venues.update(vs => vs.filter(v => v.id !== id))),
    );
  }

  // ── Layout (Restaurantplan) ───────────────────────────────────────────────
  loadLayout(venueId: string): Observable<{ layout: VenueLayout | null }> {
    return this.http.get<{ layout: VenueLayout | null }>(`${this.base}/${venueId}/layout`);
  }

  saveLayout(venueId: string, tables: PlacedTable[], walls: PlacedWall[]): Observable<{ layout: VenueLayout }> {
    return this.http.put<{ layout: VenueLayout }>(`${this.base}/${venueId}/layout`, {
      layout: { tables, walls },
    });
  }
}
