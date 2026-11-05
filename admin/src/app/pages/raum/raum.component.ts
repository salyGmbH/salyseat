import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { RoomsService } from '../../services/rooms.service';
import { ReservationsService } from '../../services/reservations.service';
import { SavedRoom } from '../../services/room.types';

@Component({
  selector: 'app-raum',
  standalone: true,
  imports: [MatIconModule, RouterLink, DatePipe],
  templateUrl: './raum.component.html',
  styleUrl: './raum.component.scss'
})
export class RaumComponent {
  private readonly roomsService = inject(RoomsService);
  private readonly reservationsService = inject(ReservationsService);

  rooms = this.roomsService.rooms;
  confirmDeleteId = '';

  askDelete(event: MouseEvent, id: string) {
    event.stopPropagation();
    event.preventDefault();
    this.confirmDeleteId = id;
  }

  cancelDelete(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    this.confirmDeleteId = '';
  }

  confirmDelete(event: MouseEvent, id: string) {
    event.stopPropagation();
    event.preventDefault();
    this.roomsService.removeRoom(id);
    this.reservationsService.removeForRoom(id);
    this.confirmDeleteId = '';
  }

  totalSeats(room: SavedRoom): number {
    return room.tables.reduce((sum, t) => sum + t.seats, 0);
  }

  tableCount(room: SavedRoom): number {
    return room.tables.length;
  }
}