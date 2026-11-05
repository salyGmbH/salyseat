import { Injectable, computed, signal } from '@angular/core';
import { Reservation, ReservationStatus } from './reservation.types';

const STORAGE_KEY = 'salyseat.reservations.v1';

@Injectable({ providedIn: 'root' })
export class ReservationsService {
  private readonly _reservations = signal<Reservation[]>(this.load());
  readonly reservations = computed(() => this._reservations());

  // ── Persistenz ──────────────────────────────────────────────────────────
  private load(): Reservation[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Reservation[]) : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._reservations()));
    } catch { /* ignore */ }
  }

  // ── Abfragen ────────────────────────────────────────────────────────────
  forRoomAndDate(roomId: string, date: string): Reservation[] {
    return this._reservations()
      .filter(r => r.roomId === roomId && r.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  forRoom(roomId: string): Reservation[] {
    return this._reservations().filter(r => r.roomId === roomId);
  }

  // ── CRUD ────────────────────────────────────────────────────────────────
  add(input: Omit<Reservation, 'id' | 'status' | 'createdAt' | 'updatedAt'> & {
    status?: ReservationStatus;
  }): Reservation {
    const now = Date.now();
    const reservation: Reservation = {
      ...input,
      id: crypto.randomUUID(),
      status: input.status ?? 'upcoming',
      createdAt: now,
      updatedAt: now,
    };
    this._reservations.update(rs => [...rs, reservation]);
    this.persist();
    return reservation;
  }

  update(id: string, patch: Partial<Reservation>): void {
    this._reservations.update(rs =>
      rs.map(r => (r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r)),
    );
    this.persist();
  }

  setStatus(id: string, status: ReservationStatus): void {
    this.update(id, { status });
  }

  remove(id: string): void {
    this._reservations.update(rs => rs.filter(r => r.id !== id));
    this.persist();
  }

  // Wenn ein Raum gelöscht wird, auch alle zugehörigen Reservierungen löschen
  removeForRoom(roomId: string): void {
    this._reservations.update(rs => rs.filter(r => r.roomId !== roomId));
    this.persist();
  }
}