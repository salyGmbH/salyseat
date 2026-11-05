import { Injectable, signal, computed } from '@angular/core';
import { PlacedTable, PlacedWall, SavedRoom } from './room.types';

const STORAGE_KEY = 'lyandro.rooms.v1';

@Injectable({ providedIn: 'root' })
export class RoomsService {
  private readonly _rooms = signal<SavedRoom[]>(this.load());
  readonly rooms = computed(() => this._rooms());

  // ── Persistenz ──────────────────────────────────────────────────────────
  private load(): SavedRoom[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SavedRoom[]) : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._rooms()));
    } catch {
      /* z.B. Storage voll – im MVP ignorieren */
    }
  }

  // ── CRUD ────────────────────────────────────────────────────────────────
  addRoom(name: string, tables: PlacedTable[], walls: PlacedWall[]): SavedRoom {
    const now = Date.now();
    const room: SavedRoom = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
      // deep-copy, damit spätere Änderungen im Editor den gespeicherten Raum nicht beeinflussen
      tables: JSON.parse(JSON.stringify(tables)),
      walls: JSON.parse(JSON.stringify(walls)),
    };
    this._rooms.update(rs => [...rs, room]);
    this.persist();
    return room;
  }

  updateRoom(
    id: string,
    patch: Partial<Pick<SavedRoom, 'name' | 'tables' | 'walls'>>,
  ): void {
    this._rooms.update(rs =>
      rs.map(r => (r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r)),
    );
    this.persist();
  }

  removeRoom(id: string): void {
    this._rooms.update(rs => rs.filter(r => r.id !== id));
    this.persist();
  }

  getRoom(id: string): SavedRoom | undefined {
    return this._rooms().find(r => r.id === id);
  }
}