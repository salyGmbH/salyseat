import { Component, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { GetraenkeReminderService } from '../../services/getraenke-reminder.service';

@Component({
  selector: 'app-getraenke-float',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './getraenke-float.component.html',
  styleUrl:    './getraenke-float.component.scss',
})
export class GetraenkeFloatComponent {
  readonly svc = inject(GetraenkeReminderService);
}