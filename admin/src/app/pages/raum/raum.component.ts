import { Component, inject, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { RoomsService } from '../../services/rooms.service';

@Component({
  selector: 'app-raum',
  standalone: true,
  imports: [MatIconModule, RouterLink, DatePipe, TranslateModule],
  templateUrl: './raum.component.html',
  styleUrl: './raum.component.scss'
})
export class RaumComponent implements OnInit {
  private readonly roomsService = inject(RoomsService);
  private readonly route        = inject(ActivatedRoute);
  private readonly router       = inject(Router);

  rooms           = this.roomsService.rooms;
  confirmDeleteId = '';
  readonly loading = signal(false);
  readonly error   = signal<string | null>(null);

  // Force-Delete-State: Id + Anzahl der blockierenden Reservierungen
  forceDeleteId    = '';
  forceDeleteCount = 0;

  prefillParams: Record<string, string> = {};

  ngOnInit(): void {
    // Query-Params für Hotelgast-Prefill merken
    const q = this.route.snapshot.queryParamMap;
    const prefillName = q.get('prefillName') ?? '';
    if (prefillName) {
      this.prefillParams = {
        prefillName,
        prefillEmail: q.get('prefillEmail') ?? '',
        prefillPhone: q.get('prefillPhone') ?? '',
        prefillSize:  q.get('prefillSize')  ?? '2',
      };
    }

    this.loading.set(true);
    this.roomsService.load().subscribe({
      next: () => {
        this.loading.set(false);
        // Bei genau einem Raum direkt weiterleiten (mit Prefill-Params)
        if (prefillName && this.rooms().length === 1) {
          this.router.navigate(['/raum', this.rooms()[0].id], {
            queryParams: this.prefillParams,
            replaceUrl: true,
          });
        }
      },
      error: () => { this.loading.set(false); this.error.set('Räume konnten nicht geladen werden.'); },
    });
  }

  askDelete(event: MouseEvent, id: string): void {
    event.stopPropagation();
    event.preventDefault();
    this.confirmDeleteId = id;
    this.forceDeleteId   = '';
  }

  cancelDelete(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.confirmDeleteId = '';
    this.forceDeleteId   = '';
  }

  confirmDelete(event: MouseEvent, id: string): void {
    event.stopPropagation();
    event.preventDefault();
    this.confirmDeleteId = '';
    this.roomsService.removeRoom(id).subscribe({
      error: (err: HttpErrorResponse) => {
        if (err.status === 409) {
          this.forceDeleteId    = id;
          this.forceDeleteCount = err.error?.reservationCount ?? 0;
        }
      },
    });
  }

  confirmForceDelete(event: MouseEvent, id: string): void {
    event.stopPropagation();
    event.preventDefault();
    this.forceDeleteId = '';
    this.roomsService.removeRoom(id, true).subscribe();
  }

}
