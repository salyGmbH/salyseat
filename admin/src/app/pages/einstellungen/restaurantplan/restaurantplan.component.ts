import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RoomsService } from '../../../services/rooms.service';
import { TableBlockService, TableBlock } from '../../../services/table-block.service';
import { PlacedTable } from '../../../services/room.types';
import { localDateIso } from '../../../shared/local-date.util';

@Component({
  selector: 'app-restaurantplan',
  standalone: true,
  imports: [MatIconModule, DatePipe, RouterLink],
  templateUrl: './restaurantplan.component.html',
  styleUrl: './restaurantplan.component.scss'
})
export class RestaurantplanComponent implements OnInit {
  private readonly roomsService = inject(RoomsService);
  readonly tableBlocks          = inject(TableBlockService);

  rooms = this.roomsService.rooms;

  selectedRoomId = signal<string | null>(null);
  selectedRoom   = computed(() => this.rooms().find(r => r.id === this.selectedRoomId()) ?? null);

  addBlockForTable = signal<{ roomId: string; table: PlacedTable } | null>(null);

  formDateFrom = '';
  formDateTo   = '';
  formFullDay  = true;
  formTimeFrom = '';
  formTimeTo   = '';
  formReason   = '';
  formError    = signal<string | null>(null);

  ngOnInit() {
    this.roomsService.load().subscribe(() => {
      if (this.rooms().length > 0) {
        this.loadRoomAndSelect(this.rooms()[0].id);
      }
    });
  }

  selectRoom(id: string) {
    if (this.selectedRoomId() === id) return;
    this.loadRoomAndSelect(id);
  }

  private loadRoomAndSelect(id: string) {
    this.roomsService.loadRoomLayout(id).subscribe(() => {
      this.selectedRoomId.set(id);
      this.tableBlocks.loadForVenue(id).subscribe();
    });
  }

  blocksForTable(roomId: string, tableId: number): TableBlock[] {
    return this.tableBlocks.blocksForTable(roomId, tableId);
  }

  openAddBlock(roomId: string, table: PlacedTable) {
    const today = localDateIso();
    this.formDateFrom = today;
    this.formDateTo   = today;
    this.formFullDay  = true;
    this.formTimeFrom = '';
    this.formTimeTo   = '';
    this.formReason   = '';
    this.formError.set(null);
    this.addBlockForTable.set({ roomId, table });
  }

  cancelAddBlock() { this.addBlockForTable.set(null); }

  saveBlock() {
    const ctx = this.addBlockForTable();
    if (!ctx) return;

    if (!this.formDateFrom || !this.formDateTo) { this.formError.set('Bitte Datum ausfüllen.'); return; }
    if (this.formDateFrom > this.formDateTo)    { this.formError.set('"Bis"-Datum muss nach "Von"-Datum liegen.'); return; }
    if (!this.formFullDay && (!this.formTimeFrom || !this.formTimeTo)) { this.formError.set('Bitte Uhrzeiten ausfüllen.'); return; }
    if (!this.formFullDay && this.formTimeFrom >= this.formTimeTo)     { this.formError.set('"Bis"-Uhrzeit muss nach "Von"-Uhrzeit liegen.'); return; }

    this.tableBlocks.addBlock(ctx.roomId, {
      tableId:  ctx.table.id,
      dateFrom: this.formDateFrom,
      dateTo:   this.formDateTo,
      fullDay:  this.formFullDay,
      timeFrom: this.formFullDay ? undefined : this.formTimeFrom,
      timeTo:   this.formFullDay ? undefined : this.formTimeTo,
      reason:   this.formReason.trim() || undefined,
    }).subscribe({
      next: () => this.addBlockForTable.set(null),
      error: () => this.formError.set('Fehler beim Speichern der Sperrzeit.'),
    });
  }

  removeBlock(id: string) {
    const venueId = this.selectedRoomId();
    if (venueId) this.tableBlocks.removeBlock(venueId, id).subscribe();
  }

  formatBlockLabel(b: TableBlock): string {
    const range = b.dateFrom === b.dateTo ? this.formatDate(b.dateFrom) : `${this.formatDate(b.dateFrom)} – ${this.formatDate(b.dateTo)}`;
    return b.fullDay ? `${range} · Ganztägig` : `${range} · ${b.timeFrom}–${b.timeTo} Uhr`;
  }

  private formatDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  isActiveNow(b: TableBlock): boolean {
    const now  = new Date();
    const date = localDateIso(now);
    const hhmm = now.toTimeString().slice(0, 5);
    if (date < b.dateFrom || date > b.dateTo) return false;
    if (b.fullDay) return true;
    return hhmm >= (b.timeFrom ?? '00:00') && hhmm <= (b.timeTo ?? '23:59');
  }
}
