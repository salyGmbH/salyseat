import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Shift, AvailEntry, ShiftTemplate, SpSettings, WageEntry, SwapRequest, ShiftType, AvailType,
} from '../pages/schichtplanung/schichtplanung.component';

interface ApiShift {
  id: string; employee_id: string; date: string; type: string;
  start_time: string | null; end_time: string | null; note: string;
}

interface ApiAvail {
  id: string; employee_id: string; weekday: number; type: string;
}

interface ApiTemplate {
  id: string; name: string; entries: ShiftTemplate['entries'];
}

interface ApiSettings {
  overtime_limit: number; min_staff: number[];
}

interface ApiWage {
  id: string; employee_id: string; hourly_rate: number;
}

interface ApiSwap {
  id: string; from_employee_id: string; to_employee_id: string;
  date: string; status: string; note: string; created_at: number;
}

@Injectable({ providedIn: 'root' })
export class SchichtplanungService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/shift-plan';

  // ── Mapping API → Frontend ──────────────────────────────────────────────

  private toShift(a: ApiShift): Shift {
    return {
      id:         a.id,
      employeeId: a.employee_id,
      date:       a.date,
      type:       a.type as ShiftType,
      startTime:  a.start_time ?? '',
      endTime:    a.end_time   ?? '',
      note:       a.note,
    };
  }

  private toAvail(a: ApiAvail): AvailEntry {
    return { employeeId: a.employee_id, weekday: a.weekday, type: a.type as AvailType };
  }

  private toTemplate(a: ApiTemplate): ShiftTemplate {
    return { id: a.id, name: a.name, entries: a.entries };
  }

  private toSettings(a: ApiSettings): SpSettings {
    return { overtimeLimit: a.overtime_limit, minStaff: a.min_staff };
  }

  private toWage(a: ApiWage): WageEntry {
    return { employeeId: a.employee_id, hourlyRate: a.hourly_rate };
  }

  private toSwap(a: ApiSwap): SwapRequest {
    return {
      id:             a.id,
      fromEmployeeId: a.from_employee_id,
      toEmployeeId:   a.to_employee_id,
      date:           a.date,
      status:         a.status as SwapRequest['status'],
      note:           a.note,
      createdAt:      a.created_at,
    };
  }

  // ── Shifts ──────────────────────────────────────────────────────────────

  loadShifts(from: string, to: string): Observable<Shift[]> {
    return new Observable(obs => {
      this.http.get<ApiShift[]>(`${this.base}/shifts?from=${from}&to=${to}`).subscribe({
        next: list => { obs.next(list.map(a => this.toShift(a))); obs.complete(); },
        error: err => obs.error(err),
      });
    });
  }

  upsertShift(shift: Omit<Shift, 'id'> & { id?: string }): Observable<Shift> {
    const body = {
      employee_id: shift.employeeId, date: shift.date, type: shift.type,
      start_time:  shift.startTime  || null,
      end_time:    shift.endTime    || null,
      note:        shift.note       || null,
    };
    return new Observable(obs => {
      this.http.post<ApiShift>(`${this.base}/shifts`, body).subscribe({
        next: a => { obs.next(this.toShift(a)); obs.complete(); },
        error: err => obs.error(err),
      });
    });
  }

  bulkUpsertShifts(shifts: Shift[]): Observable<Shift[]> {
    const body = shifts.map(s => ({
      employee_id: s.employeeId, date: s.date, type: s.type,
      start_time:  s.startTime || null,
      end_time:    s.endTime   || null,
      note:        s.note      || null,
    }));
    return new Observable(obs => {
      this.http.post<ApiShift[]>(`${this.base}/shifts/bulk`, body).subscribe({
        next: list => { obs.next(list.map(a => this.toShift(a))); obs.complete(); },
        error: err => obs.error(err),
      });
    });
  }

  deleteShift(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/shifts/${id}`);
  }

  reassignShift(id: string, employeeId: string): Observable<Shift> {
    return new Observable(obs => {
      this.http.patch<ApiShift>(`${this.base}/shifts/${id}/employee`, { employee_id: employeeId }).subscribe({
        next: a => { obs.next(this.toShift(a)); obs.complete(); },
        error: err => obs.error(err),
      });
    });
  }

  // ── Availability ────────────────────────────────────────────────────────

  loadAvailability(): Observable<AvailEntry[]> {
    return new Observable(obs => {
      this.http.get<ApiAvail[]>(`${this.base}/availability`).subscribe({
        next: list => { obs.next(list.map(a => this.toAvail(a))); obs.complete(); },
        error: err => obs.error(err),
      });
    });
  }

  upsertAvailability(employeeId: string, weekday: number, type: AvailType): Observable<AvailEntry> {
    return new Observable(obs => {
      this.http.put<ApiAvail>(`${this.base}/availability`, { employee_id: employeeId, weekday, type }).subscribe({
        next: a => { obs.next(this.toAvail(a)); obs.complete(); },
        error: err => obs.error(err),
      });
    });
  }

  deleteAvailability(employeeId: string, weekday: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/availability/${employeeId}/${weekday}`);
  }

  // ── Templates ───────────────────────────────────────────────────────────

  loadTemplates(): Observable<ShiftTemplate[]> {
    return new Observable(obs => {
      this.http.get<ApiTemplate[]>(`${this.base}/templates`).subscribe({
        next: list => { obs.next(list.map(a => this.toTemplate(a))); obs.complete(); },
        error: err => obs.error(err),
      });
    });
  }

  createTemplate(name: string, entries: ShiftTemplate['entries']): Observable<ShiftTemplate> {
    return new Observable(obs => {
      this.http.post<ApiTemplate>(`${this.base}/templates`, { name, entries }).subscribe({
        next: a => { obs.next(this.toTemplate(a)); obs.complete(); },
        error: err => obs.error(err),
      });
    });
  }

  deleteTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/templates/${id}`);
  }

  // ── Settings ────────────────────────────────────────────────────────────

  loadSettings(): Observable<SpSettings> {
    return new Observable(obs => {
      this.http.get<ApiSettings>(`${this.base}/settings`).subscribe({
        next: a => { obs.next(this.toSettings(a)); obs.complete(); },
        error: err => obs.error(err),
      });
    });
  }

  saveSettings(settings: SpSettings): Observable<SpSettings> {
    const body = { overtime_limit: settings.overtimeLimit, min_staff: settings.minStaff };
    return new Observable(obs => {
      this.http.put<ApiSettings>(`${this.base}/settings`, body).subscribe({
        next: a => { obs.next(this.toSettings(a)); obs.complete(); },
        error: err => obs.error(err),
      });
    });
  }

  // ── Wages ───────────────────────────────────────────────────────────────

  loadWages(): Observable<WageEntry[]> {
    return new Observable(obs => {
      this.http.get<ApiWage[]>(`${this.base}/wages`).subscribe({
        next: list => { obs.next(list.map(a => this.toWage(a))); obs.complete(); },
        error: err => obs.error(err),
      });
    });
  }

  setWage(employeeId: string, hourlyRate: number): Observable<void> {
    return this.http.put<void>(`${this.base}/wages/${employeeId}`, { hourly_rate: hourlyRate });
  }

  // ── Swaps ────────────────────────────────────────────────────────────────

  loadSwaps(): Observable<SwapRequest[]> {
    return new Observable(obs => {
      this.http.get<ApiSwap[]>(`${this.base}/swaps`).subscribe({
        next: list => { obs.next(list.map(a => this.toSwap(a))); obs.complete(); },
        error: err => obs.error(err),
      });
    });
  }

  createSwap(req: Omit<SwapRequest, 'id' | 'createdAt'>): Observable<SwapRequest> {
    const body = {
      from_employee_id: req.fromEmployeeId, to_employee_id: req.toEmployeeId,
      date: req.date, note: req.note || null,
    };
    return new Observable(obs => {
      this.http.post<ApiSwap>(`${this.base}/swaps`, body).subscribe({
        next: a => { obs.next(this.toSwap(a)); obs.complete(); },
        error: err => obs.error(err),
      });
    });
  }

  updateSwapStatus(id: string, status: 'pending' | 'accepted' | 'rejected'): Observable<SwapRequest> {
    return new Observable(obs => {
      this.http.patch<ApiSwap>(`${this.base}/swaps/${id}`, { status }).subscribe({
        next: a => { obs.next(this.toSwap(a)); obs.complete(); },
        error: err => obs.error(err),
      });
    });
  }

  deleteSwap(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/swaps/${id}`);
  }
}