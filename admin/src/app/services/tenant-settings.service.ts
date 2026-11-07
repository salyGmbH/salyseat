import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { StatusColor } from './status-colors.service';

export interface ConfigItem {
  key: string;
  label: string;
  color: string;
  icon?: string;
}

export interface TenantUiSettings {
  statuses?: StatusColor[];
  statusView?: 'card' | 'text' | 'svg';
  hinweise?: ConfigItem[];
  hinweisView?: 'text' | 'svg';
  gasttypen?: ConfigItem[];
  gastView?: 'text' | 'svg';
  sortMode?: 'status' | 'time' | 'combined';
}

@Injectable({ providedIn: 'root' })
export class TenantSettingsService {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/v1/admin/tenant/settings';

  load(): Observable<TenantUiSettings> {
    return this.http.get<TenantUiSettings>(this.url).pipe(
      catchError(() => of({}))
    );
  }

  save(settings: TenantUiSettings): Observable<TenantUiSettings> {
    return this.http.put<TenantUiSettings>(this.url, settings).pipe(
      catchError(() => of(settings))
    );
  }
}
