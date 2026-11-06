export type FloorReservationStatus =
  | 'upcoming'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no-show';

export interface FloorReservation {
  id: string;
  backendId?: string;
  roomId: string;
  guestName: string;
  partySize: number;
  date: string;
  time: string;
  durationMinutes: number;
  tableId?: number;
  status: FloorReservationStatus;
  notes?: string;
  phone?: string;
  createdAt: number;
  updatedAt: number;
}

export const STATUS_LABELS: Record<FloorReservationStatus, string> = {
  upcoming:  'Geplant',
  seated:    'Eingecheckt',
  completed: 'Beendet',
  cancelled: 'Storniert',
  'no-show': 'Nicht erschienen',
};
