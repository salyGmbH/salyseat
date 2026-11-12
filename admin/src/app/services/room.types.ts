export type TableType = 'round' | 'square' | 'long';

/**
 * Dekor-Elemente: alles, was kein Tisch und keine Wand ist.
 * Werden im Plan platziert, lassen sich verschieben, drehen, skalieren –
 * aber haben keine Sitzplätze und können nicht gemergt werden.
 */
export type DecorType =
  | 'plant'
  | 'pillar'
  | 'door'
  | 'window'
  | 'stairs'
  | 'wc'
  | 'entrance'
  | 'bar'
  | 'stage'
  | 'coatrack'
  | 'sofa'
  | 'cashier';

export interface PlacedTable {
  id: number;
  type: TableType;
  x: number; y: number;
  rotation: number;
  scale: number;
  seats: number;
  mergedWith?: number;
  originalSeats?: number;
}

export interface PlacedWall {
  id: number;
  x: number; y: number;
  length: number;
  rotation: number;
}

export interface PlacedDecor {
  id: number;
  type: DecorType;
  x: number; y: number;
  rotation: number;
  scale: number;
}

export interface SavedRoom {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tables: PlacedTable[];
  walls: PlacedWall[];
  decors: PlacedDecor[];
  tableCount: number;
  seatCount: number;
  isBlockedToday: boolean;
  activeBlockIds: string[];
}
