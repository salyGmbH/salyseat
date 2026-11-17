import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  readonly auth = inject(AuthService);

  nav = [
    { label: 'Kunden',    route: '/kunden',    icon: 'groups' },
    { label: 'Verträge',  route: '/vertraege', icon: 'description' },
    { label: 'Rechnungen',route: '/rechnungen',icon: 'receipt_long' },
    { label: 'Add-ons',   route: '/addons',    icon: 'extension' },
  ];
}
