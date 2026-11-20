export type FloorReservationStatus =
  | 'upcoming'
  | 'confirmed'
  | 'late'
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
  /** Mehrere zusammengeführte Tische für eine Reservierung. */
  tableIds?: number[];
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
  guestNoShowCount?: number;
  paymentStatus?:        string | null;
  paymentCaptureMethod?: string | null;
  source?:               string | null;
  hotelRoomNumber?:      string | null;
  packages?:             FloorReservationPackage[];
  createdAt: number;
  updatedAt: number;
}

export interface FloorReservationPackage {
  packageId:       string;
  packageName:     string;
  pricePerPerson:  number | null;
  quantity:        number;
}

export const STATUS_LABELS: Record<FloorReservationStatus, string> = {
  upcoming:  'Warteliste',
  confirmed: 'Bevorstehend',
  late:      'Verspätet',
  seated:    'Eingecheckt',
  expired:   'Abgelaufen',
  cleanup:   'Wird gereinigt',
  completed: 'Beendet',
  cancelled: 'Storniert',
  'no-show': 'Nicht erschienen',
};
