export type TableType = 'round' | 'square' | 'long';

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

export interface SavedRoom {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tables: PlacedTable[];
  walls: PlacedWall[];
}
