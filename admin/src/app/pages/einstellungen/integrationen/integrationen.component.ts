import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-integrationen',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './integrationen.component.html',
  styleUrl: './integrationen.component.scss'
})
export class IntegrationenComponent {
  features = [
    { icon: 'payments',        label: 'Stripe / PayPal für Anzahlungen' },
    { icon: 'event',           label: 'Google Calendar Sync' },
    { icon: 'language',        label: 'Website-Widget-Einbettung' },
    { icon: 'api',             label: 'Eigene Webhooks & REST-API' },
    { icon: 'hotel',           label: 'Hotel-PMS (SIHOT, Mews, Apaleo)' },
    { icon: 'chat',            label: 'Slack / Teams Benachrichtigungen' },
  ];
}
