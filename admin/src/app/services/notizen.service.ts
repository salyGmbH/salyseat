import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface NotizCreatedBy {
  name: string;
  employeeNumber: number | null;
}

export interface Notiz {
  id: string;
  date: string;
  time: string | null;
  title: string;
  text: string;
  color: 'default' | 'warn' | 'success' | 'info';
  done: boolean;
  createdBy: NotizCreatedBy | null;
  createdAt: string;
}

export interface CreateNotizDto {
  date: string;
  time?: string | null;
  title: string;
  text?: string;
  color?: Notiz['color'];
}

@Injectable({ providedIn: 'root' })
export class NotizenService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/notizen';

  getAll(): Observable<Notiz[]> {
    return this.http.get<Notiz[]>(this.base);
  }

  create(dto: CreateNotizDto): Observable<Notiz> {
    return this.http.post<Notiz>(this.base, dto);
  }

  update(id: string, dto: Partial<CreateNotizDto>): Observable<Notiz> {
    return this.http.patch<Notiz>(`${this.base}/${id}`, dto);
  }

  toggleDone(id: string): Observable<Notiz> {
    return this.http.patch<Notiz>(`${this.base}/${id}/toggle-done`, {});
  }

  delete(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${id}`);
  }
}
