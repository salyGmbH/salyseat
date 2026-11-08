import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { NgClass } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Subscription, interval, forkJoin } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { DashboardService, DashboardStats } from '../../services/dashboard.service';
import { ReservationsService } from '../../services/reservations.service';
import { Reservation, ReservationStatus, STATUS_LABELS } from '../../services/reservation.types';
import { GuestsService, Guest } from '../../services/guests.service';

const REFRESH_INTERVAL_MS = 60_000; // 60 Sekunden

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [MatIconModule, RouterLink, NgClass],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly svc       = inject(DashboardService);
  private readonly resSvc    = inject(ReservationsService);
  private readonly guestsSvc = inject(GuestsService);
  private refreshSub?: Subscription;

  readonly stats          = signal<DashboardStats | null>(null);
  readonly todayRes       = signal<Reservation[]>([]);
  readonly birthdayGuests = signal<Guest[]>([]);
  readonly weddingGuests  = signal<Guest[]>([]);
  readonly loading        = signal(true);
  readonly error         = signal(false);
  readonly lastUpdated   = signal<Date | null>(null);

  readonly today = new Date().toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  private readonly todayIso = (() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().split('T')[0];
  })();

  /** Heutige Reservierungen chronologisch sortiert, aktive zuerst, max. 10 */
  readonly upcomingRes = computed(() =>
    this.todayRes()
      .filter(r => r.status !== 'cancelled' && r.status !== 'no_show')
      .sort((a, b) => {
        // Aktive zuerst (seated/cleanup), dann nach Uhrzeit
        const activeStatuses = ['seated', 'cleanup'];
        const aActive = activeStatuses.includes(a.status) ? 0 : 1;
        const bActive = activeStatuses.includes(b.status) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
      })
      .slice(0, 10),
  );

  ngOnInit(): void {
    this.fetchAll(true);

    // Automatisch alle 60 Sekunden aktualisieren
    this.refreshSub = interval(REFRESH_INTERVAL_MS)
      .pipe(switchMap(() => this.fetchAll$(false)))
      .subscribe();
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  refresh(): void {
    this.fetchAll(false);
  }

  /** Beide Quellen gleichzeitig laden */
  private fetchAll(showLoading: boolean): void {
    if (showLoading) this.loading.set(true);
    this.error.set(false);

    const todayMmDd = this.todayIso.slice(5); // 'MM-DD'

    forkJoin({
      stats:  this.svc.load(),
      res:    this.resSvc.load({ date: this.todayIso, limit: 200 }),
      guests: this.guestsSvc.load({ limit: 500 }),
    }).subscribe({
      next: ({ stats, res, guests }) => {
        this.stats.set(stats);
        this.todayRes.set(res.reservations);
        this.birthdayGuests.set(
          guests.guests.filter(g => g.birthday?.slice(5) === todayMmDd)
        );
        this.weddingGuests.set(
          guests.guests.filter(g => g.wedding_date?.slice(5) === todayMmDd)
        );
        this.loading.set(false);
        this.lastUpdated.set(new Date());
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  private fetchAll$(showLoading: boolean) {
    this.fetchAll(showLoading);
    // interval braucht ein Observable zurück — wir nutzen es nur für den Side-Effect
    return [];
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  formatUpdated(d: Date): string {
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  statusLabel(s: ReservationStatus): string {
    return STATUS_LABELS[s] ?? s;
  }

  statusClass(s: ReservationStatus): string {
    const map: Record<string, string> = {
      pending:   'badge--warn',
      confirmed: 'badge--primary',
      seated:    'badge--active',
      cleanup:   'badge--cleanup',
      completed: 'badge--muted',
      cancelled: 'badge--danger',
      no_show:   'badge--danger',
    };
    return map[s] ?? '';
  }
}
