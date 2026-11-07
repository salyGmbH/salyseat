import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { LayoutService } from '../layout.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatIconModule, MatMenuModule, MatDividerModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent implements OnDestroy {
  layout = inject(LayoutService);
  private auth = inject(AuthService);

  collapsed = signal(false);

  restaurants = ['salyseat Restaurant', 'Restaurant X', 'Cafe Y'];
  selectedRestaurant = signal('salyseat Restaurant');

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

  ngOnDestroy() {
    clearInterval(this._clockInterval);
  }

  toggle() {
    this.collapsed.update(v => !v);
  }

  selectRestaurant(name: string) {
    this.selectedRestaurant.set(name);
  }

  logout() {
    this.auth.logout();
  }
}
