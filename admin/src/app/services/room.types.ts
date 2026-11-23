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
  | 'cashier'
  | 'label';

export interface PlacedTable {
  id: number;
  type: TableType;
  x: number; y: number;
  rotation: number;
  scale: number;
  seats: number;
  mergedWith?: number;
  originalSeats?: number;
  /** IDs der Tische, mit denen dieser Tisch kombinierbar ist (bidirektional) */
  combinableWith?: number[];
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
  /** Nur für type 'label': frei editierbarer Text */
  text?: string;
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

/** Breite eines Text-Labels im Plan: mindestens 120px, wächst mit der Textlänge. */
export function getLabelWidth(text?: string): number {
  const len = (text ?? '').trim().length;
  return Math.max(120, len * 9 + 32);
}
