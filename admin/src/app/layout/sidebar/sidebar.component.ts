import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { LayoutService } from '../layout.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatIconModule, MatMenuModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  layout = inject(LayoutService);
  collapsed = signal(false);

  restaurants = ['Salyseat Restaurant', 'Restaurant X', 'Cafe Y'];
  selectedRestaurant = signal('Salyseat Restaurant');

  toggle() {
    this.collapsed.update(v => !v);
  }

  selectRestaurant(name: string) {
    this.selectedRestaurant.set(name);
  }
}
