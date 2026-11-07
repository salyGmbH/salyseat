export type FloorReservationStatus =
  | 'upcoming'
  | 'seated'
  | 'expired'
  | 'cleanup'
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
  gasttypen?: string[];
  hinweise?: string[];
  guestId?: string;
  guestEmail?: string;
  guestInternalNotes?: string;
  guestBlocked?: boolean;
  guestBlockedReason?: string;
  createdAt: number;
  updatedAt: number;
}

export const STATUS_LABELS: Record<FloorReservationStatus, string> = {
  upcoming:  'Geplant',
  seated:    'Eingecheckt',
  expired:   'Reservierungszeit abgelaufen',
  cleanup:   'Wird gereinigt',
  completed: 'Beendet',
  cancelled: 'Storniert',
  'no-show': 'Nicht erschienen',
};
