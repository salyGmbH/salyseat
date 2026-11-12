export interface Venue {
  id: string;
  name: string;
  category: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  defaultDurationMinutes: number;
  maxAdvanceBookingDays: number;
  minAdvanceBookingHours: number;
  active: boolean;
  resourceCount: number;
  tableCount: number;
  seatCount: number;
  isBlockedToday: boolean;
  activeBlockIds: string[];
}

export interface VenueLayout {
  tables: import('./room.types').PlacedTable[];
  walls:  import('./room.types').PlacedWall[];
  decors?: import('./room.types').PlacedDecor[];
}

export interface CreateVenueDto {
  name: string;
  category?: string;
  description?: string;
  defaultDurationMinutes?: number;
  maxAdvanceBookingDays?: number;
  minAdvanceBookingHours?: number;
}

export interface UpdateVenueDto {
  name?: string;
  category?: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  timezone?: string;
  defaultDurationMinutes?: number;
  maxAdvanceBookingDays?: number;
  minAdvanceBookingHours?: number;
}
