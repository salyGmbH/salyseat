import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { environment } from '../../../environments/environment';
import {
  ReservationsService,
  toAtomDateTime,
} from '../../services/reservations.service';

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

@Component({
  selector: 'wdg-start',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './start.component.html',
  styleUrl: './start.component.scss',
})
export class StartComponent {
  private readonly reservations = inject(ReservationsService);
  private readonly route        = inject(ActivatedRoute);

  restaurantName = 'Salyseat Restaurant';

  // Heute als Vorbelegung & Mindestdatum
  readonly today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // ─── Slot-Auswahl (Signals) ──────────────────────────────────────────────
  date   = signal<string>(this.today);
  time   = signal<string>('19:00');
  people = signal<number>(2);

  // ─── Gastdaten ───────────────────────────────────────────────────────────
  guestName  = signal<string>('');
  guestEmail = signal<string>('');
  guestPhone = signal<string>('');
  notes      = signal<string>('');

  // ─── Personen-Stepper ────────────────────────────────────────────────────
  readonly minPeople = 1;
  readonly maxPeople = 12;

  decrement(): void {
    this.people.update((n) => Math.max(this.minPeople, n - 1));
  }

  increment(): void {
    this.people.update((n) => Math.min(this.maxPeople, n + 1));
  }

  // ─── Submit-Status ───────────────────────────────────────────────────────
  state         = signal<SubmitState>('idle');
  errorMessage  = signal<string>('');
  successInfo   = signal<{ name: string; date: string; time: string; people: number } | null>(null);

  // ─── Validität ───────────────────────────────────────────────────────────
  // Pflichtfelder für den Backend-Call: name, email, datum, uhrzeit, party_size
  readonly emailLooksOk = computed(() =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.guestEmail().trim()),
  );

  readonly canSubmit = computed(() =>
    !!this.date() &&
    !!this.time() &&
    this.people() >= this.minPeople &&
    this.guestName().trim().length >= 2 &&
    this.emailLooksOk() &&
    this.state() !== 'submitting',
  );

  /** Venue-ID — entweder aus URL ?venue=... oder aus environment.ts */
  private resolveVenueId(): string {
    const fromQuery = this.route.snapshot.queryParamMap.get('venue');
    return (fromQuery ?? environment.venueId).trim();
  }

  weiter(): void {
    if (!this.canSubmit()) return;

    const venueId = this.resolveVenueId();
    if (!venueId || venueId.startsWith('00000000')) {
      this.state.set('error');
      this.errorMessage.set(
        'Es ist keine Venue-ID konfiguriert. Bitte in src/environments/environment.ts ' +
        'eintragen oder per ?venue=<UUID> in der URL übergeben.',
      );
      return;
    }

    this.state.set('submitting');
    this.errorMessage.set('');

    this.reservations
      .create({
        venue_id:    venueId,
        guest_name:  this.guestName().trim(),
        guest_email: this.guestEmail().trim(),
        guest_phone: this.guestPhone().trim() || undefined,
        party_size:  this.people(),
        starts_at:   toAtomDateTime(this.date(), this.time()),
        notes:       this.notes().trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.state.set('success');
          this.successInfo.set({
            name:   this.guestName().trim(),
            date:   this.date(),
            time:   this.time(),
            people: this.people(),
          });
        },
        error: (err) => {
          this.state.set('error');
          // Backend liefert entweder { error: '...' } oder { errors: { feld: '...' } }
          const body = err?.error;
          if (body?.error) {
            this.errorMessage.set(body.error);
          } else if (body?.errors) {
            const first = Object.values(body.errors)[0];
            this.errorMessage.set(String(first ?? 'Reservierung fehlgeschlagen.'));
          } else {
            this.errorMessage.set('Reservierung konnte nicht gespeichert werden.');
          }
        },
      });
  }

  /** Formular zurücksetzen für eine zweite Buchung. */
  reset(): void {
    this.date.set(this.today);
    this.time.set('19:00');
    this.people.set(2);
    this.guestName.set('');
    this.guestEmail.set('');
    this.guestPhone.set('');
    this.notes.set('');
    this.state.set('idle');
    this.errorMessage.set('');
    this.successInfo.set(null);
  }

  /** Datum hübsch fürs Success-Panel. */
  formatDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
}
