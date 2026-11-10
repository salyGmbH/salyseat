import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';

export interface Reminder {
  id: string;
  guestId: string;
  guestName: string;
  note: string;
  dueDate: string;   // 'YYYY-MM-DD'
  createdAt: string; // ISO
  dismissed: boolean;
}

@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/guests';

  private readonly _all = signal<Reminder[]>([]);

  readonly all = this._all.asReadonly();

  /** Fällige Erinnerungen: dueDate <= heute, nicht dismissed */
  readonly due = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this._all().filter(r => !r.dismissed && r.dueDate <= today);
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.http.get<{ reminders: Reminder[] }>('/api/v1/admin/guests/reminders').pipe(
      catchError(() => of({ reminders: [] }))
    ).subscribe(res => this._all.set(res.reminders));
  }

  /** Erinnerungen für einen bestimmten Gast */
  forGuest(guestId: string): Reminder[] {
    return this._all().filter(r => r.guestId === guestId);
  }

  add(guestId: string, guestName: string, note: string, dueDate: string): void {
    const reminder: Reminder = {
      id: crypto.randomUUID(),
      guestId,
      guestName,
      note: note.trim(),
      dueDate,
      createdAt: new Date().toISOString(),
      dismissed: false,
    };
    // Optimistisches Update
    this._all.update(list => [...list, reminder]);
    this.http.post<{ reminders: Reminder[] }>(`${this.base}/${guestId}/reminders`, {
      id: reminder.id, note: reminder.note, dueDate,
    }).subscribe({
      next: res => {
        // Sync mit Server-Antwort (enthält guestId + guestName)
        this._all.update(list => [
          ...list.filter(r => r.guestId !== guestId),
          ...res.reminders,
        ]);
      },
      error: () => {
        // Rollback bei Fehler
        this._all.update(list => list.filter(r => r.id !== reminder.id));
      },
    });
  }

  remove(id: string): void {
    const reminder = this._all().find(r => r.id === id);
    if (!reminder) return;
    // Optimistisches Update
    this._all.update(list => list.filter(r => r.id !== id));
    this.http.delete<{ reminders: Reminder[] }>(`${this.base}/${reminder.guestId}/reminders/${id}`).subscribe({
      next: res => {
        this._all.update(list => [
          ...list.filter(r => r.guestId !== reminder.guestId),
          ...res.reminders,
        ]);
      },
      error: () => {
        // Rollback
        this._all.update(list => [...list, reminder]);
      },
    });
  }

  dismiss(id: string): void {
    const reminder = this._all().find(r => r.id === id);
    if (!reminder) return;
    // Optimistisches Update
    this._all.update(list => list.map(r => r.id === id ? { ...r, dismissed: true } : r));
    this.http.patch(`${this.base}/${reminder.guestId}/reminders/${id}/dismiss`, {}).subscribe({
      error: () => {
        // Rollback
        this._all.update(list => list.map(r => r.id === id ? { ...r, dismissed: false } : r));
      },
    });
  }
}
