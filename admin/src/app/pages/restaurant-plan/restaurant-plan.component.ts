import { Component, ElementRef, HostListener, OnInit, computed, inject, signal, ViewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { RoomsService } from '../../services/rooms.service';
import { PlacedTable, PlacedWall, SavedRoom, TableType } from '../../services/room.types';

interface MergeDialogData {
  movingId: number;
  targetId: number;
  originalSeatsA: number;
  originalSeatsB: number;
}

type ActiveDrag =
  | { mode: 'move-table'; id: number; offsetX: number; offsetY: number }
  | { mode: 'rotate';     id: number; kind: 'table' | 'wall'; cx: number; cy: number; startAngle: number; startRotation: number }
  | { mode: 'resize';     id: number; cx: number; cy: number; startScale: number; startDist: number }
  | { mode: 'move-wall';  id: number; offsetX: number; offsetY: number }
  | { mode: 'wall-len';   id: number; fixedX: number; fixedY: number; axisX: number; axisY: number };

@Component({
  selector: 'app-restaurant-plan',
  standalone: true,
  imports: [MatIconModule, RouterLink, DatePipe],
  templateUrl: './restaurant-plan.component.html',
  styleUrl: './restaurant-plan.component.scss'
})
export class RestaurantPlanComponent implements OnInit {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLDivElement>;

  isEditing       = signal(false);
  placedTables    = signal<PlacedTable[]>([]);
  placedWalls     = signal<PlacedWall[]>([]);
  selectedTableId = signal<number | null>(null);
  selectedWallId  = signal<number | null>(null);
  editingSeatsId  = signal<number | null>(null);

  // Edit-Modus: id des geladenen Raums, sonst null = neuer Raum
  editingRoomId  = signal<string | null>(null);
  currentRoomName = signal<string>('');
  saveFeedback    = signal<string | null>(null);

  // Dialoge
  mergeConfirmDialog = signal<MergeDialogData | null>(null);
  mergeSeatsDialog   = signal<MergeDialogData | null>(null);
  splitDialog        = signal<number | null>(null); // id eines der beiden Tische
  saveDialogOpen     = signal(false);
  saveError          = signal<string | null>(null);
  discardDialogOpen  = signal(false);
  mergeSeatsInput    = 8;
  roomNameInput      = '';

  private nextId     = 1;
  private activeDrag: ActiveDrag | null = null;
  private dragFromPalette: TableType | 'wall' | null = null;

  private readonly roomsService = inject(RoomsService);
  private readonly router       = inject(Router);
  private readonly route        = inject(ActivatedRoute);

  private readonly paramMap = toSignal(this.route.paramMap);

  // Liste der gespeicherten Räume (für die Landing Page)
  savedRooms = this.roomsService.rooms;

  totalSeats(room: SavedRoom): number {
    return room.tables.reduce((sum, t) => sum + t.seats, 0);
  }

  readonly saving = signal(false);

  ngOnInit(): void {
    this.roomsService.load().subscribe(() => {
      const id = this.paramMap()?.get('id');
      if (id) {
        this.roomsService.loadRoomLayout(id).subscribe(() => this.loadRoomForEditing(id));
      }
    });
  }

  // ── Edit-Modus ─────────────────────────────────────────────────────────
  editRoom(id: string) {
    this.router.navigate(['/restaurant-plan', id]);
  }

  private loadRoomForEditing(id: string) {
    const room = this.roomsService.getRoom(id);
    if (!room) {
      this.router.navigate(['/restaurant-plan']);
      return;
    }
    // deep-copy, damit Änderungen erst beim Speichern greifen
    const tables = JSON.parse(JSON.stringify(room.tables)) as PlacedTable[];
    const walls  = JSON.parse(JSON.stringify(room.walls)) as PlacedWall[];
    this.placedTables.set(tables);
    this.placedWalls.set(walls);
    this.editingRoomId.set(room.id);
    this.currentRoomName.set(room.name);
    this.isEditing.set(true);

    // nextId so setzen, dass neue Elemente keine Kollisionen haben
    const maxId = Math.max(
      0,
      ...tables.map(t => t.id),
      ...walls.map(w => w.id),
    );
    this.nextId = maxId + 1;
  }

  // ── Editor ───────────────────────────────────────────────────────────────

  openEditor() {
    this.resetEditor();
    this.isEditing.set(true);
  }

  closeEditor() {
    // Beim Verlassen Editor zurücksetzen und ggf. Route bereinigen
    this.isEditing.set(false);
    this.resetEditor();
    if (this.paramMap()?.get('id')) {
      this.router.navigate(['/restaurant-plan']);
    }
  }

  private resetEditor() {
    this.placedTables.set([]);
    this.placedWalls.set([]);
    this.selectedTableId.set(null);
    this.selectedWallId.set(null);
    this.editingSeatsId.set(null);
    this.editingRoomId.set(null);
    this.currentRoomName.set('');
    this.saveFeedback.set(null);
    this.saveError.set(null);
    this.nextId = 1;
  }

  // ── Speichern ────────────────────────────────────────────────────────────

  openSaveDialog() {
    if (this.placedTables().length === 0 && this.placedWalls().length === 0) {
      this.saveError.set('Füge zuerst mindestens einen Tisch oder Raumtrenner hinzu.');
      this.saveDialogOpen.set(true);
      return;
    }
    this.saveError.set(null);
    // im Edit-Modus den bestehenden Namen vorausfüllen, sonst leer
    this.roomNameInput = this.editingRoomId() ? this.currentRoomName() : '';
    this.saveDialogOpen.set(true);
    setTimeout(() => {
      const input = document.querySelector('.dialog__name-input') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 0);
  }

  cancelSaveDialog() {
    this.saveDialogOpen.set(false);
    this.saveError.set(null);
  }

  confirmSaveRoom() {
    const name = this.roomNameInput.trim();
    if (!name) {
      this.saveError.set('Bitte gib einen Namen für den Raum ein.');
      return;
    }
    if (this.placedTables().length === 0 && this.placedWalls().length === 0) {
      this.saveError.set('Füge zuerst mindestens einen Tisch oder Raumtrenner hinzu.');
      return;
    }

    const existingId = this.editingRoomId();
    this.saving.set(true);

    if (existingId) {
      this.roomsService.updateRoom(existingId, {
        name,
        tables: this.placedTables(),
        walls:  this.placedWalls(),
      }).subscribe({
        next: () => {
          this.saving.set(false);
          this.currentRoomName.set(name);
          this.saveDialogOpen.set(false);
          this.saveError.set(null);
          this.showSaveFeedback(`"${name}" wurde aktualisiert.`);
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set('Speichern fehlgeschlagen. Bitte erneut versuchen.');
        },
      });
    } else {
      this.roomsService.addRoom(name, this.placedTables(), this.placedWalls()).subscribe({
        next: (room) => {
          this.saving.set(false);
          this.saveDialogOpen.set(false);
          this.saveError.set(null);
          this.router.navigate(['/raum', room.id]);
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set('Speichern fehlgeschlagen. Bitte erneut versuchen.');
        },
      });
    }
  }

  private showSaveFeedback(msg: string) {
    this.saveFeedback.set(msg);
    setTimeout(() => {
      if (this.saveFeedback() === msg) this.saveFeedback.set(null);
    }, 2500);
  }

  // ── Verwerfen-Dialog ───────────────────────────────────────────────────
  askDiscardChanges() {
    // Wenn unten im Editor, aber nichts drauf, direkt schließen
    if (this.placedTables().length === 0 && this.placedWalls().length === 0) {
      this.closeEditor();
      return;
    }
    this.discardDialogOpen.set(true);
  }

  cancelDiscard() {
    this.discardDialogOpen.set(false);
  }

  confirmDiscard() {
    this.discardDialogOpen.set(false);
    this.closeEditor();
  }

  // ── Selektion ─────────────────────────────────────────────────────────────

  onCanvasMouseDown(event: MouseEvent) {
    if ((event.target as HTMLElement) === this.canvasRef.nativeElement) {
      this.selectedTableId.set(null);
      this.selectedWallId.set(null);
      this.editingSeatsId.set(null);
    }
  }

  // ── Tisch-Dimensionen ─────────────────────────────────────────────────────

  getTableSize(type: TableType): { w: number; h: number } {
    return type === 'long' ? { w: 140, h: 70 } : { w: 70, h: 70 };
  }

  getTableCenter(t: PlacedTable): { x: number; y: number } {
    const { w, h } = this.getTableSize(t.type);
    return { x: t.x + (w * t.scale) / 2, y: t.y + (h * t.scale) / 2 };
  }

  // ── Palette → Canvas ──────────────────────────────────────────────────────

  onPaletteDragStart(event: DragEvent, type: TableType | 'wall') {
    this.dragFromPalette = type;
    event.dataTransfer!.effectAllowed = 'copy';
  }

  onCanvasDragOver(event: DragEvent) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
  }

  onCanvasDrop(event: DragEvent) {
    event.preventDefault();
    if (!this.dragFromPalette) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const cx   = event.clientX - rect.left;
    const cy   = event.clientY - rect.top;

    if (this.dragFromPalette === 'wall') {
      this.placedWalls.update(ws => [...ws, { id: this.nextId++, x: cx, y: cy, length: 120, rotation: 0 }]);
    } else {
      const type = this.dragFromPalette as TableType;
      const { w, h } = this.getTableSize(type);
      this.placedTables.update(ts => [...ts, {
        id: this.nextId++, type,
        x: Math.max(0, cx - w / 2), y: Math.max(0, cy - h / 2),
        rotation: 0, scale: 1,
        seats: type === 'long' ? 6 : 4,
      }]);
    }
    this.dragFromPalette = null;
  }

  // ── Tisch: Verschieben ────────────────────────────────────────────────────

  onTableMouseDown(event: MouseEvent, id: number) {
    event.preventDefault(); event.stopPropagation();
    this.selectedTableId.set(id);
    this.selectedWallId.set(null);
    this.editingSeatsId.set(null);
    const rect  = this.canvasRef.nativeElement.getBoundingClientRect();
    const table = this.placedTables().find(t => t.id === id)!;
    this.activeDrag = { mode: 'move-table', id,
      offsetX: event.clientX - rect.left - table.x,
      offsetY: event.clientY - rect.top  - table.y };
  }

  // ── Tisch: Drehen & Skalieren ─────────────────────────────────────────────

  onRotateHandleMouseDown(event: MouseEvent, id: number, kind: 'table' | 'wall') {
    event.preventDefault(); event.stopPropagation();
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    let cx: number, cy: number, startRotation: number;

    if (kind === 'table') {
      const t  = this.placedTables().find(t => t.id === id)!;
      const c  = this.getTableCenter(t);
      cx = c.x + rect.left; cy = c.y + rect.top;
      startRotation = t.rotation;
    } else {
      const w  = this.placedWalls().find(w => w.id === id)!;
      cx = w.x + rect.left; cy = w.y + rect.top;
      startRotation = w.rotation;
    }

    this.activeDrag = { mode: 'rotate', id, kind, cx, cy,
      startAngle:    Math.atan2(event.clientY - cy, event.clientX - cx),
      startRotation };
  }

  onResizeHandleMouseDown(event: MouseEvent, id: number) {
    event.preventDefault(); event.stopPropagation();
    const rect   = this.canvasRef.nativeElement.getBoundingClientRect();
    const table  = this.placedTables().find(t => t.id === id)!;
    const c      = this.getTableCenter(table);
    const cx     = c.x + rect.left, cy = c.y + rect.top;
    this.activeDrag = { mode: 'resize', id, cx, cy,
      startScale: table.scale,
      startDist:  Math.hypot(event.clientX - cx, event.clientY - cy) };
  }

  // ── Tisch: Entfernen & Sitzplätze ─────────────────────────────────────────

  removeTable(event: MouseEvent, id: number) {
    event.stopPropagation();
    // Ggf. gemergten Partner lösen
    const table = this.placedTables().find(t => t.id === id);
    if (table?.mergedWith) {
      this.placedTables.update(ts => ts.map(t =>
        t.id === table.mergedWith ? { ...t, mergedWith: undefined, originalSeats: undefined } : t
      ));
    }
    this.placedTables.update(ts => ts.filter(t => t.id !== id));
    this.selectedTableId.set(null);
  }

  openSeatsEdit(event: MouseEvent, id: number) {
    event.stopPropagation();
    this.editingSeatsId.set(id);
    setTimeout(() => {
      const input = this.canvasRef.nativeElement.querySelector('.seats-popup__input') as HTMLInputElement;
      input?.focus(); input?.select();
    }, 0);
  }

  onSeatsKeydown(event: KeyboardEvent, id: number) {
    if (event.key === 'Enter')  this.applySeats(id, (event.target as HTMLInputElement).value);
    if (event.key === 'Escape') this.editingSeatsId.set(null);
  }

  onSeatsBlur(event: FocusEvent, id: number) {
    this.applySeats(id, (event.target as HTMLInputElement).value);
  }

  private applySeats(id: number, raw: string) {
    const seats = Math.max(1, Math.min(20, parseInt(raw) || 4));
    this.placedTables.update(ts => ts.map(t => t.id === id ? { ...t, seats } : t));
    this.editingSeatsId.set(null);
  }

  // ── Sitzplatzpositionen ───────────────────────────────────────────────────

  getSeatPositions(count: number): Array<{ x: number; y: number }> {
    return Array.from({ length: count }, (_, i) => {
      const a = (2 * Math.PI * i / count) - Math.PI / 2;
      return { x: +(35 + 31 * Math.cos(a)).toFixed(1), y: +(35 + 31 * Math.sin(a)).toFixed(1) };
    });
  }

  getLongTableSeatPositions(count: number): Array<{ x: number; y: number }> {
    const tableLeft = 8, tableRight = 132;
    const w = tableRight - tableLeft;
    const topCount    = Math.ceil(count / 2);
    const bottomCount = Math.floor(count / 2);
    const positions: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < topCount; i++)
      positions.push({ x: +(tableLeft + w / (topCount + 1) * (i + 1)).toFixed(1), y: 5 });
    for (let i = 0; i < bottomCount; i++)
      positions.push({ x: +(tableLeft + w / (bottomCount + 1) * (i + 1)).toFixed(1), y: 65 });
    return positions;
  }

  // ── Zusammenstellen: Erkennung ────────────────────────────────────────────

  private checkMerge(movedId: number) {
    const tables = this.placedTables();
    const moved  = tables.find(t => t.id === movedId);
    if (!moved || moved.mergedWith !== undefined) return;

    for (const other of tables) {
      if (other.id === movedId || other.mergedWith !== undefined) continue;
      if (this.tablesOverlap(moved, other)) {
        this.mergeSeatsInput = moved.seats + other.seats;
        this.mergeConfirmDialog.set({
          movingId:       movedId,
          targetId:       other.id,
          originalSeatsA: moved.seats,
          originalSeatsB: other.seats,
        });
        return;
      }
    }
  }

  private tablesOverlap(a: PlacedTable, b: PlacedTable): boolean {
    const ca = this.getTableCenter(a);
    const cb = this.getTableCenter(b);
    const { w: aw, h: ah } = this.getTableSize(a.type);
    const { w: bw, h: bh } = this.getTableSize(b.type);
    const threshold = (Math.max(aw, ah) * a.scale + Math.max(bw, bh) * b.scale) / 2 * 0.65;
    return Math.hypot(ca.x - cb.x, ca.y - cb.y) < threshold;
  }

  // ── Zusammenstellen: Dialoge ──────────────────────────────────────────────

  confirmMerge() {
    const data = this.mergeConfirmDialog();
    if (!data) return;
    this.mergeConfirmDialog.set(null);
    this.mergeSeatsDialog.set(data);
    setTimeout(() => {
      const input = document.querySelector('.dialog__seats-input') as HTMLInputElement;
      input?.focus(); input?.select();
    }, 0);
  }

  cancelMerge() {
    this.mergeConfirmDialog.set(null);
    this.mergeSeatsDialog.set(null);
  }

  confirmMergeSeats() {
    const data  = this.mergeSeatsDialog();
    if (!data) return;
    const total  = Math.max(2, Math.min(40, this.mergeSeatsInput));
    const seatsA = Math.ceil(total / 2);
    const seatsB = Math.floor(total / 2);

    this.placedTables.update(ts => ts.map(t => {
      if (t.id === data.movingId)
        return { ...t, mergedWith: data.targetId, seats: seatsA, originalSeats: data.originalSeatsA };
      if (t.id === data.targetId)
        return { ...t, mergedWith: data.movingId, seats: seatsB, originalSeats: data.originalSeatsB };
      return t;
    }));
    this.mergeSeatsDialog.set(null);
  }

  // ── Auseinander stellen ───────────────────────────────────────────────────

  onSplitClick(event: MouseEvent, tableId: number) {
    event.stopPropagation();
    this.splitDialog.set(tableId);
  }

  confirmSplit() {
    const id = this.splitDialog();
    if (id === null) return;
    const tables = this.placedTables();
    const table  = tables.find(t => t.id === id);
    if (!table) return;

    this.placedTables.update(ts => ts.map(t => {
      if (t.id === id || t.id === table.mergedWith)
        return { ...t, mergedWith: undefined, seats: t.originalSeats ?? t.seats, originalSeats: undefined };
      return t;
    }));
    this.splitDialog.set(null);
    this.selectedTableId.set(null);
  }

  cancelSplit() { this.splitDialog.set(null); }

  // ── Merge-Paare für Darstellung ───────────────────────────────────────────

  getMergedPairs(): Array<{ a: PlacedTable; b: PlacedTable }> {
    const tables = this.placedTables();
    const pairs: Array<{ a: PlacedTable; b: PlacedTable }> = [];
    const seen  = new Set<number>();
    for (const t of tables) {
      if (t.mergedWith !== undefined && !seen.has(t.id)) {
        const other = tables.find(o => o.id === t.mergedWith);
        if (other) { pairs.push({ a: t, b: other }); seen.add(t.id); seen.add(other.id); }
      }
    }
    return pairs;
  }

  getMergeLineStyle(a: PlacedTable, b: PlacedTable): Record<string, string> {
    const ca  = this.getTableCenter(a);
    const cb  = this.getTableCenter(b);
    const len = Math.hypot(cb.x - ca.x, cb.y - ca.y);
    const ang = Math.atan2(cb.y - ca.y, cb.x - ca.x) * 180 / Math.PI;
    return {
      left:            ca.x + 'px',
      top:             ca.y + 'px',
      width:           len + 'px',
      transform:       `rotate(${ang}deg)`,
      transformOrigin: '0 50%',
    };
  }

  getMidpointStyle(a: PlacedTable, b: PlacedTable): Record<string, string> {
    const ca = this.getTableCenter(a);
    const cb = this.getTableCenter(b);
    return {
      left: ((ca.x + cb.x) / 2) + 'px',
      top:  ((ca.y + cb.y) / 2) + 'px',
    };
  }

  // ── Wand ──────────────────────────────────────────────────────────────────

  onWallMouseDown(event: MouseEvent, id: number) {
    event.preventDefault(); event.stopPropagation();
    this.selectedWallId.set(id);
    this.selectedTableId.set(null);
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const wall = this.placedWalls().find(w => w.id === id)!;
    this.activeDrag = { mode: 'move-wall', id,
      offsetX: event.clientX - rect.left - wall.x,
      offsetY: event.clientY - rect.top  - wall.y };
  }

  onWallEndMouseDown(event: MouseEvent, id: number, end: 'left' | 'right') {
    event.preventDefault(); event.stopPropagation();
    const rect  = this.canvasRef.nativeElement.getBoundingClientRect();
    const wall  = this.placedWalls().find(w => w.id === id)!;
    const rad   = wall.rotation * Math.PI / 180;
    const axisX = Math.cos(rad), axisY = Math.sin(rad);
    const half  = wall.length / 2;
    const fixedX = end === 'right' ? wall.x - half * axisX : wall.x + half * axisX;
    const fixedY = end === 'right' ? wall.y - half * axisY : wall.y + half * axisY;
    this.activeDrag = { mode: 'wall-len', id, fixedX, fixedY, axisX, axisY };
  }

  removeWall(event: MouseEvent, id: number) {
    event.stopPropagation();
    this.placedWalls.update(ws => ws.filter(w => w.id !== id));
    this.selectedWallId.set(null);
  }

  onRotateWallMouseDown(event: MouseEvent, id: number) {
    this.onRotateHandleMouseDown(event, id, 'wall');
  }

  // ── Globale Maus-Events ───────────────────────────────────────────────────

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.activeDrag) return;
    const drag = this.activeDrag;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mx   = event.clientX - rect.left;
    const my   = event.clientY - rect.top;

    switch (drag.mode) {
      case 'move-table':
        this.placedTables.update(ts => ts.map(t => t.id === drag.id
          ? { ...t, x: Math.max(0, mx - drag.offsetX), y: Math.max(0, my - drag.offsetY) } : t));
        break;

      case 'rotate': {
        const angle = Math.atan2(event.clientY - drag.cy, event.clientX - drag.cx);
        const delta = (angle - drag.startAngle) * (180 / Math.PI);
        if (drag.kind === 'table')
          this.placedTables.update(ts => ts.map(t => t.id === drag.id ? { ...t, rotation: drag.startRotation + delta } : t));
        else
          this.placedWalls.update(ws => ws.map(w => w.id === drag.id ? { ...w, rotation: drag.startRotation + delta } : w));
        break;
      }

      case 'resize': {
        const dist     = Math.hypot(event.clientX - drag.cx, event.clientY - drag.cy);
        const newScale = Math.min(3, Math.max(0.4, drag.startScale * (dist / drag.startDist)));
        const table    = this.placedTables().find(t => t.id === drag.id)!;
        const { w, h } = this.getTableSize(table.type);
        this.placedTables.update(ts => ts.map(t => t.id === drag.id
          ? { ...t, scale: newScale,
              x: drag.cx - rect.left - (w * newScale) / 2,
              y: drag.cy - rect.top  - (h * newScale) / 2 } : t));
        break;
      }

      case 'move-wall':
        this.placedWalls.update(ws => ws.map(w => w.id === drag.id
          ? { ...w, x: mx - drag.offsetX, y: my - drag.offsetY } : w));
        break;

      case 'wall-len': {
        const proj = (mx - drag.fixedX) * drag.axisX + (my - drag.fixedY) * drag.axisY;
        const len  = Math.max(40, proj);
        this.placedWalls.update(ws => ws.map(w => w.id === drag.id
          ? { ...w, length: len,
              x: drag.fixedX + (len / 2) * drag.axisX,
              y: drag.fixedY + (len / 2) * drag.axisY } : w));
        break;
      }
    }
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    if (this.activeDrag?.mode === 'move-table') {
      this.checkMerge(this.activeDrag.id);
    }
    this.activeDrag = null;
  }
}
