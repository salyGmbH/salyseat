import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, switchMap, of } from 'rxjs';
import { PlacedTable, PlacedWall, SavedRoom } from './room.types';
import { VenueService } from './venue.service';
import { Venue } from './venue.types';

/**
 * Adapter zwischen dem Frontend-Konzept "Raum" (SavedRoom mit Grundriss)
 * und der Backend-API (Venue + Layout-JSON).
 *
 * Jeder "Raum" im Frontend entspricht einem Venue im Backend.
 * Der Grundriss (Tische, Wände) wird im layout-Feld des Venues gespeichert.
 */
@Injectable({ providedIn: 'root' })
export class RoomsService {
  private readonly venueService = inject(VenueService);

  private readonly _layoutCache = signal<Record<string, { tables: PlacedTable[]; walls: PlacedWall[] }>>({});

  readonly rooms = computed<SavedRoom[]>(() =>
    this.venueService.venues().map(v => this.venueToRoom(v)),
  );

  // ── Laden ────────────────────────────────────────────────────────────────
  load(): Observable<unknown> {
    return this.venueService.load();
  }

  getRoom(id: string): SavedRoom | undefined {
    const venue = this.venueService.getById(id);
    return venue ? this.venueToRoom(venue) : undefined;
  }

  // ── CRUD ────────────────────────────────────────────────────────────────
  addRoom(name: string, tables: PlacedTable[], walls: PlacedWall[]): Observable<SavedRoom> {
    return this.venueService.create({ name, category: 'restaurant' }).pipe(
      switchMap(venue =>
        this.venueService.saveLayout(venue.id, tables, walls).pipe(
          tap(res => this.cacheLayout(venue.id, res.layout?.tables ?? tables, res.layout?.walls ?? walls)),
          switchMap(() => of(this.venueToRoom(venue, tables, walls))),
        ),
      ),
    );
  }

  updateRoom(id: string, patch: Partial<Pick<SavedRoom, 'name' | 'tables' | 'walls'>>): Observable<SavedRoom> {
    const updates$: Observable<unknown>[] = [];

    if (patch.name !== undefined) {
      updates$.push(this.venueService.update(id, { name: patch.name }));
    }

    if (patch.tables !== undefined || patch.walls !== undefined) {
      const cached = this._layoutCache()[id] ?? { tables: [], walls: [] };
      const tables = patch.tables ?? cached.tables;
      const walls  = patch.walls  ?? cached.walls;
      updates$.push(
        this.venueService.saveLayout(id, tables, walls).pipe(
          tap(() => this.cacheLayout(id, tables, walls)),
        ),
      );
    }

    // Sequentiell ausführen wenn beide nötig sind
    if (updates$.length === 0) return of(this.getRoom(id)!);

    return updates$[0].pipe(
      switchMap(() => updates$[1] ? updates$[1] : of(null)),
      switchMap(() => of(this.getRoom(id)!)),
    );
  }

  removeRoom(id: string): Observable<void> {
    return this.venueService.remove(id).pipe(
      tap(() => this._layoutCache.update(c => { const n = { ...c }; delete n[id]; return n; })),
    );
  }

  loadRoomLayout(id: string): Observable<{ tables: PlacedTable[]; walls: PlacedWall[] }> {
    return this.venueService.loadLayout(id).pipe(
      tap(res => {
        const tables = res.layout?.tables ?? [];
        const walls  = res.layout?.walls  ?? [];
        this.cacheLayout(id, tables, walls);
      }),
      switchMap(res => of({ tables: res.layout?.tables ?? [], walls: res.layout?.walls ?? [] })),
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  private venueToRoom(venue: Venue, tables?: PlacedTable[], walls?: PlacedWall[]): SavedRoom {
    const cached = this._layoutCache()[venue.id];
    return {
      id:        venue.id,
      name:      venue.name,
      createdAt: 0,
      updatedAt: 0,
      tables:    tables ?? cached?.tables ?? [],
      walls:     walls  ?? cached?.walls  ?? [],
    };
  }

  private cacheLayout(id: string, tables: PlacedTable[], walls: PlacedWall[]): void {
    this._layoutCache.update(c => ({ ...c, [id]: { tables, walls } }));
  }
}
