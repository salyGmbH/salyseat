import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

export interface WhatsAppConfig {
  phoneNumberId?: string;
  channelId?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface WhatsAppStatus {
  connected: boolean;
  phoneNumberId: string | null;
}

@Injectable({ providedIn: 'root' })
export class WhatsAppService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/whatsapp';

  status(): Observable<WhatsAppStatus> {
    return this.http.get<WhatsAppStatus>(`${this.base}/status`).pipe(
      catchError(() => of({ connected: false, phoneNumberId: null }))
    );
  }

  getConfig(): Observable<WhatsAppConfig> {
    return this.http.get<WhatsAppConfig>(`${this.base}/config`);
  }

  saveConfig(config: WhatsAppConfig): Observable<{ saved: boolean }> {
    return this.http.put<{ saved: boolean }>(`${this.base}/config`, config);
  }

  /** Testet die übergebenen Zugangsdaten live, unabhängig davon ob sie schon gespeichert sind. */
  test(config: WhatsAppConfig): Observable<{ connected: boolean }> {
    return this.http.post<{ connected: boolean }>(`${this.base}/test`, config).pipe(
      catchError(() => of({ connected: false }))
    );
  }
}