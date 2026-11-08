export type ReservationStatus = 'pending' | 'confirmed' | 'seated' | 'cleanup' | 'completed' | 'cancelled' | 'no_show';

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
  table_number: number | null;
  starts_at: string;
  ends_at: string;
  admin_notes: string | null;
  created_at: string;
  guest_gasttypen: string[];
  guest_hinweise: string[];
  guest_id: string | null;
  guest_internal_notes: string | null;
  guest_blocked: boolean;
  guest_blocked_reason: string | null;
  guest_no_show_count: number;
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
  seated:    'Eingecheckt',
  cleanup:   'Wird gereinigt',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
  no_show:   'No-Show',
};
