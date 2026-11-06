import { Component, inject, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { RoomsService } from '../../services/rooms.service';
import { SavedRoom } from '../../services/room.types';

@Component({
  selector: 'app-raum',
  standalone: true,
  imports: [MatIconModule, RouterLink, DatePipe],
  templateUrl: './raum.component.html',
  styleUrl: './raum.component.scss'
})
export class RaumComponent implements OnInit {
  private readonly roomsService = inject(RoomsService);

  rooms           = this.roomsService.rooms;
  confirmDeleteId = '';
  readonly loading = signal(false);
  readonly error   = signal<string | null>(null);

  ngOnInit(): void {
    this.loading.set(true);
    this.roomsService.load().subscribe({
      next:  () => this.loading.set(false),
      error: () => { this.loading.set(false); this.error.set('Räume konnten nicht geladen werden.'); },
    });
  }

  askDelete(event: MouseEvent, id: string): void {
    event.stopPropagation();
    event.preventDefault();
    this.confirmDeleteId = id;
  }

  cancelDelete(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.confirmDeleteId = '';
  }

  confirmDelete(event: MouseEvent, id: string): void {
    event.stopPropagation();
    event.preventDefault();
    this.roomsService.removeRoom(id).subscribe();
    this.confirmDeleteId = '';
  }

  totalSeats(room: SavedRoom): number {
    return room.tables.reduce((sum, t) => sum + t.seats, 0);
  }

  tableCount(room: SavedRoom): number {
    return room.tables.length;
  }
}
