import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule } from '@ngx-translate/core';
import { LayoutService } from '../layout.service';
import { AuthService } from '../../services/auth.service';
import { PlanService } from '../../services/plan.service';
import { NotizenStateService } from '../../services/notizen-state.service';
import { GuestReviewService } from '../../services/guest-review.service';
import { RoomsService } from '../../services/rooms.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatIconModule, MatMenuModule, MatDividerModule, TranslateModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent implements OnInit, OnDestroy {
  layout = inject(LayoutService);
  private auth = inject(AuthService);
  readonly plan = inject(PlanService);
  readonly notizenState = inject(NotizenStateService);
  readonly guestReviews = inject(GuestReviewService);
  private readonly router = inject(Router);
  private readonly roomsService = inject(RoomsService);

  /** Direktlink zum einzigen Raum — sonst zur Übersicht */
  readonly raumLink = computed(() => {
    const rooms = this.roomsService.rooms();
    return rooms.length === 1 ? ['/raum', rooms[0].id] : ['/raum'];
  });

  /** Auf Tablet-Breite (641–1200px) standardmäßig eingeklappt starten —
   *  auf Desktop (> 1200px) offen, auf Mobile (≤ 640px) irrelevant (dort
   *  läuft die Sidebar als Overlay über `layout.mobileOpen()`, siehe
   *  sidebar.component.scss). Grenze einheitlich mit admin-layout- und
   *  raum-detail-Tablet-Breakpoints halten. */
  collapsed = signal(
    typeof window !== 'undefined' && window.innerWidth > 640 && window.innerWidth <= 1200
  );

  restaurants = ['SALY Restaurant', 'Restaurant X', 'Cafe Y'];
  selectedRestaurant = signal('SALY Restaurant');

  /** Untermenü "Gutscheine" (z. B. Link zum Gutschein-Designer) auf-/zuklappen */
  readonly vouchersExpanded = signal(false);
  readonly schichtplanExpanded = signal(false);

  // Eingeloggten User für die Sidebar zugänglich machen
  currentUserEmail = computed(() => this.auth.user()?.email ?? '');

  // ─── Live-Uhr ──────────────────────────────────────────────────────────────
  private readonly _now = signal(new Date());
  private readonly _clockInterval = setInterval(() => this._now.set(new Date()), 1000);

  readonly timeStr = computed(() => {
    const d = this._now();
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  readonly dateStr = computed(() => {
    const d = this._now();
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  });

  ngOnInit(): void {
    this.roomsService.load().subscribe();
  }

  ngOnDestroy() {
    clearInterval(this._clockInterval);
  }

  toggle() {
    this.collapsed.update(v => !v);
  }

  selectRestaurant(name: string) {
    this.selectedRestaurant.set(name);
  }

  toggleVouchersMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.vouchersExpanded.update(v => !v);
  }

  toggleSchichtplanMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.schichtplanExpanded.update(v => !v);
  }

  logout() {
    this.auth.logout();
  }

  openNotizenPanel(): void {
    this.notizenState.dismiss();
    this.notizenState.panelOpen.set(true);
  }
}
