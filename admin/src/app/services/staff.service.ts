import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface StaffMember {
  id: string;
  employee_number: number;
  name: string;
  email: string | null;
  role: 'admin' | 'manager' | 'staff';
  active: boolean;
  created_at: string;
}

export interface CreateStaffDto {
  name: string;
  email?: string;
  role: 'admin' | 'manager' | 'staff';
}

export interface UpdateStaffDto {
  name?: string;
  email?: string | null;
  role?: 'admin' | 'manager' | 'staff';
  active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class StaffService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/staff';

  list(): Observable<StaffMember[]> {
    return this.http.get<StaffMember[]>(this.base);
  }

  create(dto: CreateStaffDto): Observable<StaffMember> {
    return this.http.post<StaffMember>(this.base, dto);
  }

  update(id: string, dto: UpdateStaffDto): Observable<StaffMember> {
    return this.http.patch<StaffMember>(`${this.base}/${id}`, dto);
  }

  delete(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${id}`);
  }
}