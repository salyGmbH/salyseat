import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

import { environment } from '../../environments/environment';

export interface GutscheinDesignSettings {
  title:        string;
  subtitle:     string;
  btnLabel:     string;
  fontFamily:   string;
  fontSize:     string;
  bgMode:       'color' | 'image';
  bgColor:      string;
  bgImage:      string | null;
  colorPrimary: string;
  colorText:    string;
  radius:       string;
}

export interface VoucherWidgetConfig {
  restaurantName:       string;
  gutscheinDesign?:     GutscheinDesignSettings;
  colorPrimary?:        string;
  logoUrl?:             string;
  stripePublishableKey?: string;
  activePaymentMethods?: string[];
}

export interface VoucherDesignImage {
  id:     string;
  name:   string;
  url:    string;
  active: boolean;
}

export interface PurchaseVoucherDto {
  amount:          number;
  recipientName:   string;
  recipientEmail?: string;
  message?:        string;
  buyerName:       string;
  buyerEmail:      string;
  imageId?:        string;
  emailTo:         ('recipient' | 'buyer')[];   // wer bekommt die Mail
}

export interface PurchasedVoucher {
  code:          string;
  amount:        number;
  recipientName: string;
  expiresAt:     string;  // YYYY-MM-DD
}

@Injectable({ providedIn: 'root' })
export class VoucherService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/widget/vouchers`;

  loadConfig(publicKey: string): Observable<VoucherWidgetConfig> {
    // TODO: GET /widget/vouchers/config/:key  →  { restaurantName, colorPrimary?, logoUrl? }
    return this.http.get<VoucherWidgetConfig>(`${this.base}/config/${publicKey}`).pipe(
      catchError(() => of({ restaurantName: 'Restaurant' }))
    );
  }

  loadImages(publicKey: string): Observable<VoucherDesignImage[]> {
    // TODO: GET /widget/vouchers/images?key=...  →  VoucherDesignImage[]
    return this.http.get<VoucherDesignImage[]>(`${this.base}/images?key=${publicKey}`).pipe(
      catchError(() => of([]))
    );
  }

  purchase(publicKey: string, dto: PurchaseVoucherDto): Observable<PurchasedVoucher> {
    return this.http.post<PurchasedVoucher>(`${this.base}/purchase?key=${publicKey}`, dto);
  }

  createPaymentIntent(publicKey: string, amountCents: number): Observable<{ client_secret: string; amount_cents: number; currency: string }> {
    return this.http.post<{ client_secret: string; amount_cents: number; currency: string }>(
      `${this.base}/payment-intent?key=${publicKey}`,
      { amount_cents: amountCents },
    );
  }
}
