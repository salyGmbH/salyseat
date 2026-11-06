import { Injectable, computed, signal } from '@angular/core';
import { FloorReservation, FloorReservationStatus } from './floor-reservation.types';

const STORAGE_KEY = 'lyandro.reservations.v1';

@Injectable({ providedIn: 'root' })
export class FloorReservationsService {
  private readonly _reservations = signal<FloorReservation[]>(this.load());
  readonly reservations = computed(() => this._reservations());

  private load(): FloorReservation[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as FloorReservation[]) : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._reservations()));
    } catch { /* ignore */ }
  }

  forRoomAndDate(roomId: string, date: string): FloorReservation[] {
    return this._reservations()
      .filter(r => r.roomId === roomId && r.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  forRoom(roomId: string): FloorReservation[] {
    return this._reservations().filter(r => r.roomId === roomId);
  }

  add(input: Omit<FloorReservation, 'id' | 'status' | 'createdAt' | 'updatedAt'> & {
    status?: FloorReservationStatus;
  }): FloorReservation {
    const now = Date.now();
    const reservation: FloorReservation = {
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

  update(id: string, patch: Partial<FloorReservation>): void {
    this._reservations.update(rs =>
      rs.map(r => (r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r)),
    );
    this.persist();
  }

  setStatus(id: string, status: FloorReservationStatus): void {
    this.update(id, { status });
  }

  remove(id: string): void {
    this._reservations.update(rs => rs.filter(r => r.id !== id));
    this.persist();
  }

  removeForRoom(roomId: string): void {
    this._reservations.update(rs => rs.filter(r => r.roomId !== roomId));
    this.persist();
  }
}