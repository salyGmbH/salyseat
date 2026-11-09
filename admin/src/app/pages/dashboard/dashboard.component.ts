import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { NgClass, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Subscription, interval, forkJoin } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { TranslateModule } from '@ngx-translate/core';
import { DashboardService, DashboardStats } from '../../services/dashboard.service';
import { ReservationsService } from '../../services/reservations.service';
import { Reservation, ReservationStatus, STATUS_LABELS } from '../../services/reservation.types';
import { GuestsService, Guest } from '../../services/guests.service';

const REFRESH_INTERVAL_MS = 60_000; // 60 Sekunden

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [MatIconModule, RouterLink, NgClass, TranslateModule, DecimalPipe],
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

  /** Heutige Reservierungen chronologisch sortiert, aktive zuerst — alle außer cancelled/no_show */
  readonly upcomingRes = computed(() =>
    this.todayRes()
      .filter(r => r.status !== 'cancelled' && r.status !== 'no_show')
      .sort((a, b) => {
        const activeStatuses = ['seated', 'cleanup'];
        const aActive = activeStatuses.includes(a.status) ? 0 : 1;
        const bActive = activeStatuses.includes(b.status) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
      }),
  );

  /** Herkunfts-Aufschlüsselung der heutigen Reservierungen */
  readonly sourceBreakdown = computed(() => {
    const res = this.todayRes().filter(r => r.status !== 'cancelled');
    return {
      online:  res.filter(r => r.source === 'online').length,
      admin:   res.filter(r => r.source === 'admin' || !r.source).length,
      walk_in: res.filter(r => r.source === 'walk_in').length,
    };
  });

  /** No-Show-Rate heute in % */
  readonly noShowRate = computed(() => {
    const s = this.stats();
    if (!s || s.today.total === 0) return 0;
    return Math.round((s.today.no_show / s.today.total) * 100);
  });

  /** Auslastung in % (abgeschlossene + aktive / gesamt) */
  readonly utilizationRate = computed(() => {
    const s = this.stats();
    if (!s || s.today.total === 0) return 0;
    return Math.round(((s.today.seated + s.today.completed) / s.today.total) * 100);
  });

  /** Wochentag-Insight (einziger angezeigter Chip) */
  readonly insights = computed((): { icon: string; text: string; type: 'info' | 'warn' | 'success' }[] => {
    const s = this.stats();
    if (!s || s.week.total === 0) return [];

    const weekday = new Date().toLocaleDateString('de-DE', { weekday: 'long' });
    const avgPerDay = s.week.total / 7;

    if (s.today.total > avgPerDay * 1.3) {
      return [{ icon: 'trending_up', text: `${weekday} ist ein starker Tag — heute ${s.today.total} Reservierungen`, type: 'success' }];
    }
    if (s.today.total > 0 && s.today.total < avgPerDay * 0.6) {
      return [{ icon: 'info', text: `Ruhiger ${weekday} — heute ${s.today.total} Reservierungen`, type: 'info' }];
    }
    return [];
  });

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
