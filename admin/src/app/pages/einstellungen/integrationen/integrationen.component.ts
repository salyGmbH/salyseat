import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-integrationen',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, TranslateModule],
  templateUrl: './integrationen.component.html',
  styleUrl: './integrationen.component.scss'
})
export class IntegrationenComponent {
  features = [
    { icon: 'payments',        label: 'Stripe / PayPal für Anzahlungen' },
    { icon: 'event',           label: 'Google Calendar Sync' },
    { icon: 'language',        label: 'Website-Widget-Einbettung' },
    { icon: 'api',             label: 'Eigene Webhooks & REST-API' },
    // Hotel-PMS hat jetzt eine eigene Seite — siehe pms-anbindung
    { icon: 'chat',            label: 'Slack / Teams Benachrichtigungen' },
  ];
}
