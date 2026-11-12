import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { FloorReservation, FloorReservationStatus } from './floor-reservation.types';
import { Reservation, ReservationListResponse } from './reservation.types';

@Injectable({ providedIn: 'root' })
export class FloorReservationsService {
  private readonly http = inject(HttpClient);
  private readonly BASE = '/api/v1/admin/reservations';

  private readonly _reservations    = signal<FloorReservation[]>([]);
  readonly reservations = computed(() => this._reservations());

  /**
   * Backend-IDs von Reservierungen, die der Nutzer manuell "gelöscht" hat
   * (z. B. abgeschlossene / stornierte aus dem Tischplan entfernt).
   * loadForVenue() importiert diese nicht erneut.
   */
  private readonly _hiddenBackendIds = new Set<string>();

  /**
   * Lädt alle Reservierungen für ein Venue an einem Datum vom Backend.
   * Bestehende transiente Zustände (late, expired) werden beibehalten.
   */
  loadForVenue(venueId: string, date: string): Observable<void> {
    const params = new HttpParams().set('date', date).set('limit', '200');
    return this.http.get<ReservationListResponse>(this.BASE, { params }).pipe(
      map(res => {
        const incoming = res.reservations
          .filter(r => r.venue_id === venueId)
          .filter(r => !this._hiddenBackendIds.has(r.id))
          .map(r => this.fromBackend(r, venueId));

        this._reservations.update(existing => {
          const byBackendId = new Map(existing.map(r => [r.backendId, r]));

          const merged = incoming.map(remote => {
            const local = remote.backendId ? byBackendId.get(remote.backendId) : undefined;
            if (!local) return remote;
            // Transiente UI-Zustände (late, expired) beibehalten —
            // sie sind nicht im Backend gespeichert
            const keepLocal = local.status === 'late' || local.status === 'expired';
            return keepLocal ? { ...remote, status: local.status } : remote;
          });

          // Optimistisch angelegte Einträge (noch kein backendId) beibehalten
          const incomingIds = new Set(incoming.map(r => r.backendId).filter(Boolean));
          const optimistic = existing.filter(
            r => !r.backendId && r.roomId === venueId && r.date === date,
          );

          return [...merged, ...optimistic];
        });
      }),
    );
  }

  forRoomAndDate(roomId: string, date: string): FloorReservation[] {
    return this._reservations()
      .filter(r => r.roomId === roomId && r.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  forRoom(roomId: string): FloorReservation[] {
    return this._reservations().filter(r => r.roomId === roomId);
  }

  /**
   * Fügt eine Reservierung optimistisch hinzu (vor Backend-Antwort).
   * Nach erfolgreichem Backend-Create muss update() mit der backendId aufgerufen werden.
   */
  add(input: Omit<FloorReservation, 'id' | 'createdAt' | 'updatedAt'> & {
    status?: FloorReservationStatus;
  }): FloorReservation {
    const now = Date.now();
    const reservation: FloorReservation = {
      ...input,
      id:        crypto.randomUUID(),
      status:    input.status ?? 'upcoming',
      createdAt: now,
      updatedAt: now,
    };
    this._reservations.update(rs => [...rs, reservation]);
    return reservation;
  }

  /** Lokales Patch — kein Backend-Sync. Für backendId-Setzen nach Erstellung, etc. */
  update(id: string, patch: Partial<FloorReservation>): void {
    this._reservations.update(rs =>
      rs.map(r => r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r),
    );
  }

  /**
   * Setzt den Status — lokal sofort (optimistic), Backend async falls backendId vorhanden.
   * late und expired sind rein lokale UI-Zustände und werden nicht ans Backend gesendet.
   */
  setStatus(id: string, status: FloorReservationStatus): void {
    const res = this._reservations().find(r => r.id === id);
    this._reservations.update(rs =>
      rs.map(r => r.id === id ? { ...r, status, updatedAt: Date.now() } : r),
    );

    if (res?.backendId && this.isSyncableStatus(status)) {
      this.syncStatus(res.backendId, status).subscribe({
        error: () => console.warn(`Status-Sync fehlgeschlagen: ${status} für ${res.backendId}`),
      });
    }
  }

  remove(id: string): void {
    const res = this._reservations().find(r => r.id === id);
    // Verhindert, dass loadForVenue() die Reservierung beim nächsten Sync
    // erneut importiert (relevant für completed / cancelled / no-show)
    if (res?.backendId) {
      this._hiddenBackendIds.add(res.backendId);
    }
    this._reservations.update(rs => rs.filter(r => r.id !== id));
  }

  removeForRoom(roomId: string): void {
    this._reservations.update(rs => rs.filter(r => r.roomId !== roomId));
  }

  // ── Intern ──────────────────────────────────────────────────────────

  private fromBackend(br: Reservation, venueId: string): FloorReservation {
    const time            = br.starts_at.substring(11, 16);
    const date            = br.starts_at.substring(0, 10);
    const durationMinutes = Math.round(
      (new Date(br.ends_at).getTime() - new Date(br.starts_at).getTime()) / 60_000,
    );

    return {
      id:                 br.id,
      backendId:          br.id,
      roomId:             venueId,
      guestName:          br.guest_name,
      partySize:          br.party_size,
      date,
      time,
      durationMinutes,
      tableId:            br.table_number ?? undefined,
      status:             this.mapBackendStatus(br.status, br.table_number),
      notes:              br.guest_notes          ?? undefined,
      phone:              br.guest_phone          ?? undefined,
      gasttypen:          br.guest_gasttypen      ?? [],
      hinweise:           br.guest_hinweise       ?? [],
      guestId:            br.guest_id             ?? undefined,
      guestEmail:         br.guest_email,
      guestInternalNotes: br.guest_internal_notes ?? undefined,
      guestBlocked:       br.guest_blocked        ?? false,
      guestBlockedReason: br.guest_blocked_reason ?? undefined,
      guestNoShowCount:    br.guest_no_show_count   ?? 0,
      paymentStatus:       (br as any).payment_status        ?? null,
      paymentCaptureMethod:(br as any).payment_capture_method ?? null,
      createdAt:           new Date(br.created_at).getTime(),
      updatedAt:          Date.now(),
    };
  }

  private mapBackendStatus(
    status: string,
    tableNumber: number | null,
  ): FloorReservationStatus {
    switch (status) {
      case 'confirmed': return 'confirmed';
      case 'seated':    return 'seated';
      case 'cleanup':   return 'cleanup';
      case 'completed': return 'completed';
      case 'cancelled': return 'cancelled';
      case 'no_show':   return 'no-show';
      // pending: Tisch zugewiesen → confirmed, sonst upcoming
      default:          return tableNumber ? 'confirmed' : 'upcoming';
    }
  }

  /** late und expired sind transiente UI-Zustände — kein Backend-Sync */
  private isSyncableStatus(status: FloorReservationStatus): boolean {
    return status !== 'late' && status !== 'expired';
  }

  capturePayment(backendId: string): Observable<unknown> {
    return this.http.post(`${this.BASE}/${backendId}/payment/capture`, {}).pipe(
      map(() => {
        this._reservations.update(rs =>
          rs.map(r => r.backendId === backendId ? { ...r, paymentStatus: 'captured', updatedAt: Date.now() } : r)
        );
      }),
    );
  }

  releasePayment(backendId: string): Observable<unknown> {
    return this.http.post(`${this.BASE}/${backendId}/payment/release`, {}).pipe(
      map(() => {
        this._reservations.update(rs =>
          rs.map(r => r.backendId === backendId ? { ...r, paymentStatus: 'released', updatedAt: Date.now() } : r)
        );
      }),
    );
  }

  private syncStatus(backendId: string, status: FloorReservationStatus): Observable<unknown> {
    const base = `${this.BASE}/${backendId}`;
    switch (status) {
      case 'confirmed': return this.http.patch(`${base}/confirm`,  {});
      case 'seated':    return this.http.patch(`${base}/seat`,     {});
      case 'cleanup':   return this.http.patch(`${base}/cleanup`,  {});
      case 'completed': return this.http.patch(`${base}/complete`, {});
      case 'cancelled': return this.http.patch(`${base}/cancel`,   {});
      case 'no-show':   return this.http.patch(`${base}/no-show`,  {});
      case 'upcoming':  return this.http.patch(`${base}/reopen`,   {});
      default:          return of(null);
    }
  }
}
