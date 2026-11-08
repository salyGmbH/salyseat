import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import { NotizenService, Notiz } from './notizen.service';

@Injectable({ providedIn: 'root' })
export class NotizenStateService implements OnDestroy {
  private readonly svc = inject(NotizenService);

  private readonly today = new Date().toISOString().slice(0, 10);

  // ── Aktuelle Uhrzeit (alle 30 Sek aktualisiert) ───────────────────────────
  private nowTime = signal(this.currentHHMM());
  private readonly clockTimer = setInterval(
    () => this.nowTime.set(this.currentHHMM()), 30_000
  );

  // ── Alle heutigen Notizen (roh) ───────────────────────────────────────────
  private allTodayNotes = signal<Notiz[]>([]);

  // ── Zeitlich fällige Notizen ──────────────────────────────────────────────
  todayNotes = computed(() => {
    const now = this.nowTime();
    return this.allTodayNotes().filter(n => !n.time || n.time <= now);
  });

  // ── Abgeleitete Zustände ──────────────────────────────────────────────────
  // "Offen" = fällig + nicht erledigt
  unreadToday = computed(() => this.todayNotes().filter(n => !n.done));
  hasUnread   = computed(() => this.unreadToday().length > 0);

  // Gesamtzahl aller heutigen Notizen (auch Erledigte) → immer in Sidebar
  totalToday  = computed(() => this.allTodayNotes().length);
  hasAny      = computed(() => this.totalToday() > 0);

  // Panel-Sichtbarkeit & Float-Status
  panelOpen      = signal(false);
  floatDismissed = signal(sessionStorage.getItem('nf-dismissed') === '1');

  constructor() { this.load(); }

  ngOnDestroy(): void { clearInterval(this.clockTimer); }

  load(): void {
    this.svc.getAll().subscribe({
      next: all => {
        this.allTodayNotes.set(
          all
            .filter(n => n.date === this.today)
            .sort((a, b) => (a.time ?? '00:00').localeCompare(b.time ?? '00:00'))
        );
      },
    });
  }

  togglePanel(): void {
    this.dismiss();
    this.panelOpen.update(v => !v);
  }

  dismiss(): void {
    this.floatDismissed.set(true);
    sessionStorage.setItem('nf-dismissed', '1');
  }

  closePanel(): void { this.panelOpen.set(false); }

  private currentHHMM(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
}
