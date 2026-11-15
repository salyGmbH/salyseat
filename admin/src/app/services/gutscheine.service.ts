import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';

export type VoucherStatus = 'active' | 'redeemed' | 'expired';

export interface PaymentMethod {
  id:          string;
  name:        string;
  description: string;
  icon:        string;
  provider:    'stripe' | 'paypal' | 'sofort' | 'manual';
  active:      boolean;
}

export interface VoucherImage {
  id:     string;
  name:   string;
  url:    string;
  active: boolean;
}

export interface Voucher {
  id:              string;
  code:            string;
  amount:          number;
  remainingAmount: number;
  buyerName:       string;
  buyerEmail:      string;
  recipientName:   string;
  recipientEmail:  string;
  message:         string;
  status:          VoucherStatus;
  expiresAt:       string;   // YYYY-MM-DD
  createdAt:       string;   // ISO datetime
  redeemedAt?:     string;   // ISO datetime
}

export interface CreateVoucherDto {
  amount:         number;
  recipientName:  string;
  recipientEmail: string;
  message:        string;
  expiresAt:      string;
}

@Injectable({ providedIn: 'root' })
export class GutscheineService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin/vouchers';

  list(): Observable<Voucher[]> {
    return this.http.get<Voucher[]>(this.base);
  }

  create(dto: CreateVoucherDto): Observable<Voucher> {
    return this.http.post<Voucher>(this.base, dto);
  }

  redeem(id: string): Observable<Voucher> {
    return this.http.put<Voucher>(`${this.base}/${id}/redeem`, {});
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  lookupCode(code: string): Observable<Voucher | null> {
    return this.http.get<Voucher>(`${this.base}/code/${code}`).pipe(
      catchError(() => of(null)),
    );
  }

  // ── Bilder ────────────────────────────────────────────────────────────────

  listImages(): Observable<VoucherImage[]> {
    return this.http.get<VoucherImage[]>(`${this.base}/images`);
  }

  uploadFile(file: File): Observable<string> {
    const form = new FormData();
    form.append('image', file);
    return this.http.post<{ url: string }>('/api/v1/admin/upload/image', form).pipe(
      map(r => r.url),
    );
  }

  addImage(img: Omit<VoucherImage, 'id' | 'active'>): Observable<VoucherImage> {
    return this.http.post<VoucherImage>(`${this.base}/images`, img);
  }

  toggleImage(id: string): Observable<VoucherImage> {
    return this.http.patch<VoucherImage>(`${this.base}/images/${id}/toggle`, {});
  }

  deleteImage(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/images/${id}`);
  }

  // ── Zahlungsmethoden ──────────────────────────────────────────────────────

  listPaymentMethods(): Observable<PaymentMethod[]> {
    return this.http.get<PaymentMethod[]>(`${this.base}/payment-methods`);
  }

  togglePaymentMethod(id: string): Observable<PaymentMethod> {
    return this.http.patch<PaymentMethod>(`${this.base}/payment-methods/${id}/toggle`, {});
  }
}
