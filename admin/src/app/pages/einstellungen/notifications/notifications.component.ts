import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss'
})
export class NotificationsComponent {
  features = [
    { icon: 'mail',           label: 'notifications.feat_email' },
    { icon: 'sms',            label: 'notifications.feat_sms' },
    { icon: 'notifications',  label: 'notifications.feat_push' },
    { icon: 'schedule',       label: 'notifications.feat_reminder' },
    { icon: 'cancel',         label: 'notifications.feat_cancel' },
  ];
}
