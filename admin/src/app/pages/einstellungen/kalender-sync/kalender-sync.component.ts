import { Component, OnInit, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CalendarService } from '../../../services/calendar.service';

@Component({
  selector: 'app-kalender-sync',
  standalone: true,
  imports: [MatIconModule, TranslateModule],
  templateUrl: './kalender-sync.component.html',
  styleUrl: './kalender-sync.component.scss',
})
export class KalenderSyncComponent implements OnInit {
  private readonly calendar  = inject(CalendarService);
  private readonly translate = inject(TranslateService);

  url        = signal('');
  loading    = signal(true);
  copied     = signal(false);
  regenerating = signal(false);
  error      = signal<string | null>(null);

  ngOnInit(): void {
    this.calendar.getFeedUrl().subscribe({
      next: r => { this.url.set(r.url); this.loading.set(false); },
      error: () => { this.error.set(this.translate.instant('kalender_sync.error_load')); this.loading.set(false); },
    });
  }

  copyUrl(): void {
    navigator.clipboard.writeText(this.url()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  regenerate(): void {
    if (!confirm(this.translate.instant('kalender_sync.regenerate_confirm'))) return;
    this.regenerating.set(true);
    this.calendar.regenerate().subscribe({
      next: r => { this.url.set(r.url); this.regenerating.set(false); },
      error: () => { this.error.set(this.translate.instant('kalender_sync.error_load')); this.regenerating.set(false); },
    });
  }
}
