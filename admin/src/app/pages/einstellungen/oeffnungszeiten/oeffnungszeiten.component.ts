import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-oeffnungszeiten',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './oeffnungszeiten.component.html',
  styleUrl: './oeffnungszeiten.component.scss'
})
export class OeffnungszeitenComponent {
  features = [
    { icon: 'schedule',         label: 'Reguläre Öffnungszeiten pro Wochentag' },
    { icon: 'restaurant',       label: 'Separate Service-Slots (Mittag, Abend)' },
    { icon: 'calendar_today',   label: 'Feiertage & Sonderöffnungen' },
    { icon: 'event_busy',       label: 'Ruhetage mit Datumsbereich' },
    { icon: 'block',            label: 'Buchungssperren (z. B. Events, Wartung)' },
  ];
}
