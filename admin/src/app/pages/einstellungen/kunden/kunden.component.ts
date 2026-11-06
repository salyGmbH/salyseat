import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-kunden',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './kunden.component.html',
  styleUrl: './kunden.component.scss'
})
export class KundenComponent {
  features = [
    { icon: 'people',         label: 'Gäste-Datenbank mit Historie' },
    { icon: 'star',           label: 'Stammgäste markieren & favorisieren' },
    { icon: 'label',          label: 'Tags (Allergien, Vorlieben, VIP)' },
    { icon: 'warning',        label: 'Blacklist für No-Shows' },
    { icon: 'cake',           label: 'Geburtstags-Erinnerungen' },
    { icon: 'trending_up',    label: 'Umsatz & Besuchsfrequenz pro Gast' },
  ];
}
