import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss'
})
export class NotificationsComponent {
  features = [
    { icon: 'mail',           label: 'E-Mail-Benachrichtigungen bei neuer Reservierung' },
    { icon: 'sms',            label: 'SMS an Gäste zur Bestätigung und Erinnerung' },
    { icon: 'notifications',  label: 'Push-Benachrichtigungen aufs Handy des Teams' },
    { icon: 'schedule',       label: 'Erinnerung X Stunden vor dem Termin' },
    { icon: 'cancel',         label: 'Stornierungs-Hinweise an Management' },
  ];
}
