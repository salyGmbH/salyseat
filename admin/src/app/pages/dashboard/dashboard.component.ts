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
import { ReminderService } from '../../services/reminder.service';
import { RoomsService } from '../../services/rooms.service';

const REFRESH_INTERVAL_MS = 60_000; // 60 Sekunden

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [MatIconModule, RouterLink, NgClass, TranslateModule, DecimalPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly svc         = inject(DashboardService);
  private readonly resSvc      = inject(ReservationsService);
  private readonly guestsSvc   = inject(GuestsService);
  private readonly reminderSvc = inject(ReminderService);
  private readonly roomsSvc    = inject(RoomsService);
  private refreshSub?: Subscription;

  /** Fällige Erinnerungen — direkt vom Service (reaktiv) */
  readonly dueReminders = this.reminderSvc.due;

  readonly stats          = signal<DashboardStats | null>(null);
  readonly todayRes       = signal<Reservation[]>([]);
  readonly weekRes        = signal<Reservation[]>([]);
  readonly birthdayGuests = signal<Guest[]>([]);
  readonly weddingGuests  = signal<Guest[]>([]);
  readonly loading        = signal(true);
  readonly error         = signal(false);
  readonly lastUpdated   = signal<Date | null>(null);

  /** Montag und Sonntag der aktuellen Woche als ISO-Strings */
  private readonly weekRange = (() => {
    const d = new Date();
    const day = d.getDay(); // 0=So, 1=Mo, ...
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(d); mon.setDate(d.getDate() + diffToMon);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmt = (dt: Date) => new Date(dt.getTime() - dt.getTimezoneOffset() * 60_000).toISOString().split('T')[0];
    return { from: fmt(mon), to: fmt(sun) };
  })();

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

  /** Today-Stats direkt aus geladenen Reservierungen — konsistent mit der rechten Spalte */
  readonly todayStats = computed(() => {
    const res = this.todayRes();
    const active = res.filter(r => !['cancelled', 'no_show'].includes(r.status));
    const seated = res.filter(r => r.status === 'seated' || r.status === 'cleanup');
    return {
      total:         active.length,
      guests:        active.reduce((sum, r) => sum + (r.party_size ?? 0), 0),
      pending:       res.filter(r => r.status === 'pending').length,
      confirmed:     res.filter(r => r.status === 'confirmed').length,
      seated:        seated.length,
      seated_guests: seated.reduce((sum, r) => sum + (r.party_size ?? 0), 0),
      completed:     res.filter(r => r.status === 'completed').length,
      cancelled:     res.filter(r => r.status === 'cancelled').length,
      no_show:       res.filter(r => r.status === 'no_show').length,
    };
  });

  /** No-Show-Rate heute in % */
  readonly noShowRate = computed(() => {
    const t = this.todayStats();
    if (t.total === 0) return 0;
    return Math.round((t.no_show / t.total) * 100);
  });

  /** Gesamtkapazität aller Räume (Summe der Sitzplätze) */
  readonly totalCapacity = computed(() =>
    this.roomsSvc.rooms().reduce((sum, r) => sum + (r.seatCount ?? 0), 0)
  );

  /** Aktuell besetzte Plätze (seated + cleanup Reservierungen heute) */
  readonly occupiedSeats = computed(() => this.todayStats().seated_guests);

  /** Freie Plätze = Gesamtkapazität − besetzte Plätze */
  readonly freeSeats = computed(() => {
    const cap = this.totalCapacity();
    if (cap === 0) return null;
    return Math.max(0, cap - this.occupiedSeats());
  });

  /**
   * Auslastung in % = aktuell besetzte Plätze / Gesamtkapazität.
   * (Nicht "abgeschlossene + aktive Reservierungen / gesamt" — das wäre
   * eine Tages-Erledigungsquote und würde gegen Ende des Tages Richtung
   * 100% wandern, selbst wenn gerade niemand mehr im Restaurant sitzt.)
   */
  readonly utilizationRate = computed(() => {
    const cap = this.totalCapacity();
    if (cap === 0) return 0;
    return Math.round((this.occupiedSeats() / cap) * 100);
  });

  /**
   * Höchste gleichzeitige Gästezahl heute (Sweep-Line über die Zeiträume
   * starts_at → ends_at aller aktiven Reservierungen). Wichtig, weil ein
   * Restaurant mit z. B. 50 Plätzen und 3 Turns pro Tag locker 150 Gäste
   * insgesamt bedient — das ist aber niemals "150 gleichzeitig". Nur die
   * größte Überschneidung zählt für die Kapazitätsauslastung.
   */
  readonly peakConcurrentGuests = computed(() => {
    const active = this.todayRes().filter(r => !['cancelled', 'no_show'].includes(r.status));
    if (active.length === 0) return 0;

    const events: { time: number; delta: number }[] = [];
    for (const r of active) {
      const size  = r.party_size ?? 0;
      const start = new Date(r.starts_at).getTime();
      const end   = new Date(r.ends_at).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || size <= 0) continue;
      events.push({ time: start, delta: size });
      events.push({ time: end, delta: -size });
    }

    // Bei identischem Zeitpunkt zuerst Abgänge, dann Zugänge verrechnen —
    // sonst zählt ein nahtloser Tischwechsel fälschlich als Überschneidung.
    events.sort((a, b) => a.time - b.time || a.delta - b.delta);

    let current = 0;
    let peak = 0;
    for (const ev of events) {
      current += ev.delta;
      if (current > peak) peak = current;
    }
    return peak;
  });

  /** Insight-Chips: stärkster Tag, Stoßzeit, Walk-ins, Auslastung, Pending, Ø-Gruppe */
  readonly insights = computed((): { icon: string; text: string; type: 'info' | 'warn' | 'success' }[] => {
    const result: { icon: string; text: string; type: 'info' | 'warn' | 'success' }[] = [];
    const res    = this.weekRes();
    const today  = this.todayRes();
    const ts     = this.todayStats();
    const src    = this.sourceBreakdown();
    const active = today.filter(r => !['cancelled', 'no_show'].includes(r.status));

    // ── 1. Stärkster Wochentag ────────────────────────────────────────────────
    if (res.length > 0) {
      const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
      const counts = new Array(7).fill(0);
      for (const r of res) counts[new Date(r.starts_at).getDay()]++;
      const maxCount = Math.max(...counts);
      if (maxCount > 0) {
        const peakDays  = DAYS.filter((_, i) => counts[i] === maxCount);
        const isToday   = counts[new Date().getDay()] === maxCount;
        const label     = isToday ? 'Heute' : peakDays.join(' & ');
        result.push({
          icon: 'trending_up',
          text: `${label} ist euer stärkster Tag dieser Woche — ${maxCount} Reservierungen`,
          type: 'success',
        });
      }
    }

    // ── 2. Kapazitäts-Auslastung (max. gleichzeitige Gäste / Gesamtsitzplätze) ──
    // Nicht die Summe aller Gäste des Tages verwenden — bei mehreren Turns
    // pro Tag würde das künstlich über 100% "ausgebucht" anzeigen, obwohl
    // nie alle Plätze gleichzeitig belegt waren.
    const cap  = this.totalCapacity();
    const peak = this.peakConcurrentGuests();
    if (cap > 0 && peak > 0) {
      const capUtil = Math.round((peak / cap) * 100);
      if (capUtil >= 75) {
        result.push({
          icon: 'local_fire_department',
          text: `Heute zu ${Math.min(capUtil, 100)}% ausgebucht — starker Tag!`,
          type: 'success',
        });
      }
    }

    // ── 3. Offene Bestätigungen ───────────────────────────────────────────────
    if (ts.pending >= 2) {
      result.push({
        icon: 'pending_actions',
        text: `${ts.pending} Reservierungen heute warten noch auf Bestätigung`,
        type: 'warn',
      });
    }

    // ── 5. Walk-ins ───────────────────────────────────────────────────────────
    if (src.walk_in >= 2 && ts.total > 0) {
      const pct = Math.round((src.walk_in / ts.total) * 100);
      result.push({
        icon: 'directions_walk',
        text: `${src.walk_in} Walk-ins heute — ${pct}% eurer Gäste sind spontan da`,
        type: 'info',
      });
    }

    // ── 6. Ø-Gruppengröße (nur wenn interessant ≥ 3 Personen) ────────────────
    if (active.length >= 3) {
      const avg = active.reduce((s, r) => s + (r.party_size ?? 0), 0) / active.length;
      if (avg >= 3) {
        result.push({
          icon: 'group',
          text: `Durchschnittliche Gruppe heute: ${avg.toFixed(1)} Personen`,
          type: 'info',
        });
      }
    }

    return result;
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
      stats:   this.svc.load(),
      res:     this.resSvc.load({ date: this.todayIso, limit: 200 }),
      weekRes: this.resSvc.load({ dateFrom: this.weekRange.from, dateTo: this.weekRange.to, limit: 1000 }),
      guests:  this.guestsSvc.load({ limit: 500 }),
    }).subscribe({
      next: ({ stats, res, weekRes, guests }) => {
        this.stats.set(stats);
        this.todayRes.set(res.reservations);
        this.weekRes.set(weekRes.reservations.filter(r => r.status !== 'cancelled' && r.status !== 'no_show'));
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

  dismissReminder(id: string): void {
    this.reminderSvc.remove(id);
  }

  formatReminderDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
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

  /** Initialen aus Gastname (max. 2 Zeichen) */
  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  /** CSS-Klasse für den farbigen Akzentstreifen links */
  rowAccentClass(s: ReservationStatus): string {
    const map: Record<string, string> = {
      pending:   'accent--warn',
      confirmed: 'accent--primary',
      seated:    'accent--active',
      cleanup:   'accent--cleanup',
      completed: 'accent--muted',
      cancelled: 'accent--danger',
      no_show:   'accent--danger',
    };
    return map[s] ?? '';
  }
}
