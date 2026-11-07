import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { combineLatest, switchMap, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ReservationsService,
  WidgetVenue,
  DayAvailability,
  Break,
  toAtomDateTime,
} from '../../services/reservations.service';

type SubmitState = 'loading' | 'idle' | 'submitting' | 'success' | 'error';

const DEFAULT_FROM = '10:00';
const DEFAULT_TO   = '23:00';
const STEP_MINUTES = 30;

function buildSlots(from: string, to: string, step: number, breaks: Break[] = []): string[] {
  const slots: string[] = [];
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  let cur = fh * 60 + fm;
  const end = th * 60 + tm;
  while (cur < end) {
    const h = String(Math.floor(cur / 60)).padStart(2, '0');
    const m = String(cur % 60).padStart(2, '0');
    const slot = `${h}:${m}`;
    const inBreak = breaks.some(b => slot >= b.from && slot < b.to);
    if (!inBreak) slots.push(slot);
    cur += step;
  }
  return slots;
}

@Component({
  selector: 'wdg-start',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './start.component.html',
  styleUrl: './start.component.scss',
})
export class StartComponent implements OnInit {
  private readonly reservations = inject(ReservationsService);
  private readonly route        = inject(ActivatedRoute);

  // ─── Config vom Backend ──────────────────────────────────────────────────
  restaurantName = signal('');
  venues         = signal<WidgetVenue[]>([]);
  selectedVenue  = signal<WidgetVenue | null>(null);

  // ─── Heute als Vorbelegung & Mindestdatum ────────────────────────────────
  readonly today = new Date().toISOString().slice(0, 10);

  // ─── Slot-Auswahl ────────────────────────────────────────────────────────
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

  decrement(): void { this.people.update(n => Math.max(this.minPeople, n - 1)); }
  increment(): void { this.people.update(n => Math.min(this.maxPeople, n + 1)); }

  // ─── Öffnungszeiten — via toObservable + switchMap ────────────────────────
  // Wenn Venue oder Datum wechselt, wird der vorherige HTTP-Call automatisch
  // abgebrochen (switchMap) und ein neuer gestartet. Kein effect() nötig.
  readonly availability = toSignal<DayAvailability | null>(
    combineLatest([
      toObservable(this.selectedVenue),
      toObservable(this.date),
    ]).pipe(
      switchMap(([venue, date]) => {
        if (!venue || !date) {
          return of<DayAvailability>({ open: true, open_time: null, close_time: null, breaks: [], reason: null });
        }
        return this.reservations.checkAvailability(venue.id, date);
      }),
    ),
    { initialValue: null },
  );

  readonly isClosedDay = computed(() => this.availability()?.open === false);

  // Zeige Default-Slots (10–23 Uhr) während Availability noch lädt (null)
  readonly timeSlots = computed<string[]>(() => {
    const avail = this.availability();
    if (avail?.open === false) return [];
    const from   = avail?.open_time  ?? DEFAULT_FROM;
    const to     = avail?.close_time ?? DEFAULT_TO;
    const breaks = avail?.breaks     ?? [];
    return buildSlots(from, to, STEP_MINUTES, breaks);
  });

  // Sicherstellen dass gewählte Zeit immer in den Slots ist
  readonly validTime = computed(() => {
    const slots = this.timeSlots();
    const t = this.time();
    if (slots.length === 0) return '';
    return slots.includes(t) ? t : slots[0];
  });

  // ─── Submit-Status ───────────────────────────────────────────────────────
  state        = signal<SubmitState>('loading');
  errorMessage = signal<string>('');
  successInfo  = signal<{ name: string; date: string; time: string; people: number; venue: string } | null>(null);

  // ─── Validität ───────────────────────────────────────────────────────────
  readonly emailLooksOk = computed(() =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.guestEmail().trim()),
  );

  readonly canSubmit = computed(() =>
    !!this.selectedVenue() &&
    !!this.date() &&
    !!this.validTime() &&
    !this.isClosedDay() &&
    this.people() >= this.minPeople &&
    this.guestName().trim().length >= 2 &&
    this.emailLooksOk() &&
    this.state() !== 'submitting',
  );

  ngOnInit(): void {
    const publicKey = this.route.snapshot.queryParamMap.get('key') ?? environment.publicKey;

    this.reservations.loadConfig(publicKey).subscribe(config => {
      this.restaurantName.set(config.name);
      this.venues.set(config.venues);

      if (config.venues.length === 1) {
        this.selectedVenue.set(config.venues[0]);
      }

      this.state.set(config.venues.length > 0 ? 'idle' : 'error');
      if (config.venues.length === 0) {
        this.errorMessage.set('Keine buchbaren Räume gefunden.');
      }
    });
  }

  selectVenue(venue: WidgetVenue): void {
    this.selectedVenue.set(venue);
  }

  onTimeChange(val: string): void {
    this.time.set(val);
  }

  weiter(): void {
    if (!this.canSubmit()) return;

    const venue = this.selectedVenue()!;
    const time  = this.validTime();
    this.state.set('submitting');
    this.errorMessage.set('');

    this.reservations.create({
      venue_id:    venue.id,
      guest_name:  this.guestName().trim(),
      guest_email: this.guestEmail().trim(),
      guest_phone: this.guestPhone().trim() || undefined,
      party_size:  this.people(),
      starts_at:   toAtomDateTime(this.date(), time),
      notes:       this.notes().trim() || undefined,
    }).subscribe({
      next: () => {
        this.state.set('success');
        this.successInfo.set({
          name:   this.guestName().trim(),
          date:   this.date(),
          time:   time,
          people: this.people(),
          venue:  venue.name,
        });
      },
      error: err => {
        this.state.set('error');
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
    if (this.venues().length > 1) this.selectedVenue.set(null);
  }

  formatDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }
}
