export type ReservationStatus =
  | 'upcoming'   // geplant – Gast kommt noch
  | 'seated'     // eingecheckt – sitzt am Tisch
  | 'completed'  // beendet – Tisch wieder frei
  | 'cancelled'  // storniert
  | 'no-show';   // nicht erschienen

export interface Reservation {
  id: string;
  roomId: string;
  guestName: string;
  partySize: number;
  date: string;          // 'YYYY-MM-DD'
  time: string;          // 'HH:mm'
  durationMinutes: number;
  tableId?: number;      // optional zugewiesener Tisch
  status: ReservationStatus;
  notes?: string;
  phone?: string;
  createdAt: number;
  updatedAt: number;
}

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  upcoming:  'Geplant',
  seated:    'Eingecheckt',
  completed: 'Beendet',
  cancelled: 'Storniert',
  'no-show': 'Nicht erschienen',
};