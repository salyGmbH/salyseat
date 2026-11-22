import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { localDateIso } from '../shared/local-date.util';

export interface TableBlock {
  id: string;
  roomId: string;
  tableId: number;
  dateFrom: string;   // ISO-Date 'YYYY-MM-DD'
  dateTo: string;     // ISO-Date 'YYYY-MM-DD'
  fullDay: boolean;
  timeFrom?: string;  // 'HH:MM'
  timeTo?: string;    // 'HH:MM'
  reason?: string;
}

interface ApiTableBlock {
  id: string;
  room_id: string;
  table_id: number;
  date_from: string;
  date_to: string;
  full_day: boolean;
  time_from: string | null;
  time_to: string | null;
  reason: string | null;
}

@Injectable({ providedIn: 'root' })
export class TableBlockService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/venues';

  private readonly _blocks = signal<TableBlock[]>([]);
  readonly blocks = this._blocks.asReadonly();

  private fromApi(b: ApiTableBlock): TableBlock {
    return {
      id:       b.id,
      roomId:   b.room_id,
      tableId:  b.table_id,
      dateFrom: b.date_from,
      dateTo:   b.date_to,
      fullDay:  b.full_day,
      timeFrom: b.time_from ?? undefined,
      timeTo:   b.time_to   ?? undefined,
      reason:   b.reason    ?? undefined,
    };
  }

  loadForVenue(venueId: string): Observable<void> {
    return this.http.get<ApiTableBlock[]>(`${this.base}/${venueId}/table-blocks`).pipe(
      tap(list => this._blocks.set(list.map(b => this.fromApi(b)))),
      map(() => undefined),
    );
  }

  blocksForRoom(roomId: string): TableBlock[] {
    return this._blocks().filter(b => b.roomId === roomId);
  }

  blocksForTable(roomId: string, tableId: number): TableBlock[] {
    return this._blocks().filter(b => b.roomId === roomId && b.tableId === tableId);
  }

  isBlockedNow(roomId: string, tableId: number): boolean {
    const now  = new Date();
    const date = localDateIso(now);
    const hhmm = now.toTimeString().slice(0, 5);

    return this._blocks().some(b => {
      if (b.roomId !== roomId || b.tableId !== tableId) return false;
      if (date < b.dateFrom || date > b.dateTo) return false;
      if (b.fullDay) return true;
      const from = b.timeFrom ?? '00:00';
      const to   = b.timeTo   ?? '23:59';
      return hhmm >= from && hhmm < to;
    });
  }

  isBlockedAt(roomId: string, tableId: number, date: string, time?: string): boolean {
    return this._blocks().some(b => {
      if (b.roomId !== roomId || b.tableId !== tableId) return false;
      if (date < b.dateFrom || date > b.dateTo) return false;
      if (b.fullDay) return true;
      if (!time) return true;
      const from = b.timeFrom ?? '00:00';
      const to   = b.timeTo   ?? '23:59';
      return time >= from && time < to;
    });
  }

  addBlock(venueId: string, block: Omit<TableBlock, 'id' | 'roomId'>): Observable<TableBlock> {
    const body = {
      table_id:  block.tableId,
      date_from: block.dateFrom,
      date_to:   block.dateTo,
      full_day:  block.fullDay,
      time_from: block.fullDay ? null : (block.timeFrom ?? null),
      time_to:   block.fullDay ? null : (block.timeTo   ?? null),
      reason:    block.reason ?? null,
    };
    return this.http.post<ApiTableBlock>(`${this.base}/${venueId}/table-blocks`, body).pipe(
      tap(created => this._blocks.update(list => [...list, this.fromApi(created)])),
      map(created => this.fromApi(created)),
    );
  }

  removeBlock(venueId: string, blockId: string): Observable<void> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${venueId}/table-blocks/${blockId}`).pipe(
      tap(() => this._blocks.update(list => list.filter(b => b.id !== blockId))),
      map(() => undefined),
    );
  }
}
