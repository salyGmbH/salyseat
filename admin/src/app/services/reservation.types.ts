export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'no_show';

export interface Reservation {
  id: string;
  token: string;
  status: ReservationStatus;
  venue_id: string;
  venue_name: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  guest_notes: string | null;
  party_size: number;
  starts_at: string;
  ends_at: string;
  admin_notes: string | null;
  created_at: string;
}

export interface ReservationListResponse {
  reservations: Reservation[];
  total: number;
  limit: number;
  offset: number;
}

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending:   'Ausstehend',
  confirmed: 'Bestätigt',
  cancelled: 'Storniert',
  no_show:   'No-Show',
};
