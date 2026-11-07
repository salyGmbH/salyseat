import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

export interface Notiz {
  id: string;
  date: string;        // "YYYY-MM-DD"
  time: string | null; // "HH:MM" oder null = ganzer Tag
  title: string;
  text: string;
  color: 'default' | 'warn' | 'success' | 'info';
  done: boolean;       // Offen / Erledigt
  createdAt: string;
}

export interface CreateNotizDto {
  date: string;
  time?: string | null;
  title: string;
  text?: string;
  color?: Notiz['color'];
}

const STORAGE_KEY = 'lydandro_notizen';

@Injectable({ providedIn: 'root' })
export class NotizenService {

  private load(): Notiz[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list: Notiz[] = raw ? JSON.parse(raw) : [];
      // Migration: ältere Einträge ohne done-Feld
      return list.map(n => ({ ...n, done: n.done ?? false }));
    } catch {
      return [];
    }
  }

  private save(list: Notiz[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  private uuid(): string {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  getAll(): Observable<Notiz[]> {
    return of(this.load());
  }

  create(dto: CreateNotizDto): Observable<Notiz> {
    const notiz: Notiz = {
      id:        this.uuid(),
      date:      dto.date,
      time:      dto.time ?? null,
      title:     dto.title,
      text:      dto.text ?? '',
      color:     dto.color ?? 'default',
      done:      false,
      createdAt: new Date().toISOString(),
    };
    const list = this.load();
    list.push(notiz);
    this.save(list);
    return of(notiz);
  }

  update(id: string, dto: Partial<CreateNotizDto>): Observable<Notiz> {
    const list = this.load();
    const idx = list.findIndex(n => n.id === id);
    if (idx === -1) throw new Error(`Notiz ${id} not found`);
    const updated: Notiz = {
      ...list[idx],
      ...(dto.date  !== undefined && { date:  dto.date }),
      ...(dto.time  !== undefined && { time:  dto.time ?? null }),
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.text  !== undefined && { text:  dto.text ?? '' }),
      ...(dto.color !== undefined && { color: dto.color ?? 'default' }),
    };
    list[idx] = updated;
    this.save(list);
    return of(updated);
  }

  toggleDone(id: string): Observable<Notiz> {
    const list = this.load();
    const idx = list.findIndex(n => n.id === id);
    if (idx === -1) throw new Error(`Notiz ${id} not found`);
    list[idx] = { ...list[idx], done: !list[idx].done };
    this.save(list);
    return of(list[idx]);
  }

  delete(id: string): Observable<{ ok: boolean }> {
    const list = this.load().filter(n => n.id !== id);
    this.save(list);
    return of({ ok: true });
  }
}