import { Component, OnInit, NgZone, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js';
import { VoucherService, VoucherDesignImage, PurchasedVoucher, GutscheinDesignSettings } from '../../services/voucher.service';
import { environment } from '../../../environments/environment';

type GcStep = 1 | 2 | 3 | 4;
type GcState = 'loading' | 'idle' | 'submitting' | 'payment' | 'paying' | 'success' | 'error';

@Component({
  selector: 'wdg-gutschein',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './gutschein.component.html',
  styleUrl: './gutschein.component.scss',
})
export class GutscheinComponent implements OnInit {
  private readonly svc   = inject(VoucherService);
  private readonly route = inject(ActivatedRoute);
  private readonly zone  = inject(NgZone);

  // ─── Stripe ───────────────────────────────────────────────────────────────
  private _stripe:   Stripe | null = null;
  private _elements: StripeElements | null = null;

  // ─── Meta ─────────────────────────────────────────────────────────────────
  restaurantName = signal('');
  title          = signal('Gutschein kaufen');
  subtitle       = signal('Verschenke einen Gutschein für ein unvergessliches Erlebnis.');
  btnLabel       = signal('Gutschein kaufen');
  state          = signal<GcState>('loading');
  errorMessage   = signal('');
  step           = signal<GcStep>(1);
  publicKey      = '';

  // ─── Zahlungsmethoden / Stripe ────────────────────────────────────────────
  stripePublishableKey = signal<string | null>(null);
  activePaymentMethods = signal<string[]>([]);
  paymentError         = signal('');

  readonly hasStripePayment = computed(() =>
    !!this.stripePublishableKey() && this.activePaymentMethods().length > 0
  );

  // ─── Design-Auswahl ───────────────────────────────────────────────────────
  images          = signal<VoucherDesignImage[]>([]);
  selectedImageId = signal<string | null>(null);
  hasImages       = computed(() => this.images().length > 0);
  selectedImage   = computed(() =>
    this.images().find(i => i.id === this.selectedImageId()) ?? null
  );

  // ─── Ergebnis ─────────────────────────────────────────────────────────────
  result: PurchasedVoucher | null = null;
  copiedCode = false;

  // ─── Formular ─────────────────────────────────────────────────────────────
  readonly presetAmounts = [25, 50, 75, 100, 150, 200];
  amount       = signal<number>(50);
  customAmount = '';

  recipientName  = '';
  recipientEmail = '';
  message        = '';

  buyerName  = '';
  buyerEmail = '';
  consent    = false;

  // ─── E-Mail-Auswahl ───────────────────────────────────────────────────────
  emailToRecipient = true;
  emailToBuyer     = true;

  // ─── Validierung ──────────────────────────────────────────────────────────
  showErrors = false;

  readonly emailOk = computed(() =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.buyerEmail.trim())
  );
  readonly recipientEmailOk = computed(() =>
    !this.recipientEmail.trim() ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.recipientEmail.trim())
  );
  readonly canProceedStep2 = computed(() => this.amount() >= 1);
  readonly canProceedStep3 = computed(() =>
    this.recipientName.trim().length >= 2 && this.recipientEmailOk()
  );
  readonly canSubmit = computed(() =>
    this.buyerName.trim().length >= 2 && this.emailOk() && this.consent
  );

  // ─── Schritte (berücksichtigt ob Bilder vorhanden) ───────────────────────
  readonly totalSteps = computed(() => this.hasImages() ? 4 : 3);
  readonly stepLabel = computed(() => {
    if (!this.hasImages()) {
      const labels: Record<number, string> = { 1: 'Betrag', 2: 'Empfänger', 3: 'Absenden' };
      return labels[this.step()] ?? '';
    }
    const labels: Record<number, string> = { 1: 'Design', 2: 'Betrag', 3: 'Empfänger', 4: 'Absenden' };
    return labels[this.step()] ?? '';
  });

  // ─── ngOnInit ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.publicKey = this.route.snapshot.queryParamMap.get('key') ?? environment.publicKey ?? '';

    if (!this.publicKey) {
      this.state.set('error');
      this.errorMessage.set('Kein Public Key angegeben.');
      return;
    }

    this.svc.loadConfig(this.publicKey).subscribe(cfg => {
      this.restaurantName.set(cfg.restaurantName);
      this.stripePublishableKey.set(cfg.stripePublishableKey ?? null);
      this.activePaymentMethods.set(cfg.activePaymentMethods ?? []);
      const d = cfg.gutscheinDesign;
      if (d) {
        this.applyDesign(d);
        if (d.title)    this.title.set(d.title);
        if (d.subtitle) this.subtitle.set(d.subtitle);
        if (d.btnLabel) this.btnLabel.set(d.btnLabel);
      }
      this.state.set('idle');
    });

    this.svc.loadImages(this.publicKey).subscribe(imgs => {
      this.images.set(imgs.filter(i => i.active));
    });
  }

  // ─── Betrag ───────────────────────────────────────────────────────────────
  selectPreset(a: number): void {
    this.amount.set(a);
    this.customAmount = '';
  }
  onCustomAmountChange(val: string): void {
    this.customAmount = val;
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) this.amount.set(Math.round(n * 100) / 100);
  }
  isPresetActive(a: number): boolean {
    return this.amount() === a && this.customAmount === '';
  }

  // ─── Navigation ───────────────────────────────────────────────────────────
  nextStep(): void {
    this.showErrors = false;
    const s = this.step();
    const withImages = this.hasImages();

    if (withImages) {
      if (s === 2 && !this.canProceedStep2()) { this.showErrors = true; return; }
      if (s === 3 && !this.canProceedStep3()) { this.showErrors = true; return; }
    } else {
      if (s === 1 && !this.canProceedStep2()) { this.showErrors = true; return; }
      if (s === 2 && !this.canProceedStep3()) { this.showErrors = true; return; }
    }

    if (s < this.totalSteps()) this.step.update(n => (n + 1) as GcStep);
  }

  prevStep(): void {
    this.showErrors = false;
    if (this.step() > 1) this.step.update(s => (s - 1) as GcStep);
  }

  skipImage(): void {
    this.selectedImageId.set(null);
    this.step.set(2);
  }

  selectImage(id: string): void {
    this.selectedImageId.set(id);
    this.step.set(2);
  }

  // ─── Absenden ─────────────────────────────────────────────────────────────
  submit(): void {
    this.showErrors = true;
    if (!this.canSubmit()) return;

    this.state.set('submitting');

    if (this.hasStripePayment()) {
      const amountCents = Math.round(this.amount() * 100);
      this.svc.createPaymentIntent(this.publicKey, amountCents).subscribe({
        next: ({ client_secret }) => {
          this.zone.run(async () => {
            await this.initStripePayment(client_secret);
          });
        },
        error: err => {
          this.zone.run(() => {
            const msg = err?.error?.error ?? 'Zahlung konnte nicht initialisiert werden.';
            this.errorMessage.set(msg);
            this.state.set('error');
          });
        },
      });
    } else {
      this.doPurchase();
    }
  }

  private async initStripePayment(clientSecret: string): Promise<void> {
    this._stripe = await loadStripe(this.stripePublishableKey()!);
    if (!this._stripe) {
      this.state.set('error');
      this.errorMessage.set('Stripe konnte nicht geladen werden.');
      return;
    }
    this._elements = this._stripe.elements({ clientSecret, locale: 'de' });
    const el = this._elements.create('payment');
    this.state.set('payment');
    setTimeout(() => {
      this.zone.run(() => el.mount('#gc-stripe-payment-element'));
    }, 150);
  }

  backToForm(): void {
    this.state.set('idle');
    this._stripe   = null;
    this._elements = null;
    this.paymentError.set('');
  }

  async confirmPayment(): Promise<void> {
    if (!this._stripe || !this._elements) return;

    this.state.set('paying');
    this.paymentError.set('');

    const { error } = await this._stripe.confirmPayment({
      elements:      this._elements,
      confirmParams: { return_url: window.location.href },
      redirect:      'if_required',
    });

    if (error) {
      this.zone.run(() => {
        this.state.set('payment');
        this.paymentError.set(error.message ?? 'Zahlung fehlgeschlagen. Bitte erneut versuchen.');
      });
      return;
    }

    this.zone.run(() => this.doPurchase());
  }

  private doPurchase(): void {
    const emailTo: ('recipient' | 'buyer')[] = [
      ...(this.emailToRecipient ? ['recipient' as const] : []),
      ...(this.emailToBuyer     ? ['buyer'     as const] : []),
    ];

    this.svc.purchase(this.publicKey, {
      amount:         this.amount(),
      recipientName:  this.recipientName.trim(),
      recipientEmail: this.recipientEmail.trim() || undefined,
      message:        this.message.trim() || undefined,
      buyerName:      this.buyerName.trim(),
      buyerEmail:     this.buyerEmail.trim(),
      imageId:        this.selectedImageId() ?? undefined,
      emailTo,
    }).subscribe({
      next: voucher => {
        this.result = voucher;
        this.state.set('success');
      },
      error: err => {
        const msg = err?.error?.message ?? err?.error?.error ?? 'Gutschein konnte nicht erstellt werden.';
        this.errorMessage.set(msg);
        this.state.set('error');
      },
    });
  }

  // ─── PDF-Download ─────────────────────────────────────────────────────────
  downloadVoucher(): void {
    if (!this.result) return;
    const v = this.result;
    const imgHtml = this.selectedImage()
      ? `<img class="vc-img" src="${this.selectedImage()!.url}" alt="">`
      : '';
    const msgHtml = this.message.trim()
      ? `<div class="vc-message">„${this.message.trim()}"</div>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Gutschein ${v.code}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: #f0f2f5; display: flex;
         align-items: center; justify-content: center; min-height: 100vh; padding: 32px; }
  .vc { width: 680px; background: #fff; border-radius: 20px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.12); overflow: hidden; }
  .vc-img { width: 100%; height: 200px; object-fit: cover; display: block; }
  .vc-body { padding: 36px 40px 40px; }
  .vc-restaurant { font-size: 12px; font-weight: 700; color: #2979ff;
                   text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
  .vc-title { font-size: 28px; font-weight: 800; color: #111; margin-bottom: 4px; }
  .vc-recipient { font-size: 16px; color: #555; margin-bottom: 24px; }
  .vc-amount { font-size: 52px; font-weight: 800; color: #111; line-height: 1;
               margin-bottom: 8px; }
  .vc-message { font-size: 15px; font-style: italic; color: #666;
                margin-bottom: 28px; padding: 14px 18px; background: #f8f9fa;
                border-radius: 10px; border-left: 3px solid #2979ff; }
  .vc-divider { height: 1px; background: #eee; margin: 24px 0; }
  .vc-code-label { font-size: 11px; font-weight: 700; color: #999;
                   text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
  .vc-code { font-family: 'Courier New', monospace; font-size: 26px; font-weight: 700;
             color: #2979ff; letter-spacing: 0.08em; background: #f0f5ff;
             padding: 12px 20px; border-radius: 10px; display: inline-block; }
  .vc-expiry { font-size: 13px; color: #999; margin-top: 16px; }
  .vc-footer { background: #f8f9fa; padding: 16px 40px; font-size: 12px; color: #aaa;
               border-top: 1px solid #eee; }
  @media print {
    body { background: white; padding: 0; }
    .vc { box-shadow: none; border-radius: 0; width: 100%; }
  }
</style>
</head>
<body>
<div class="vc">
  ${imgHtml}
  <div class="vc-body">
    <div class="vc-restaurant">${this.restaurantName()}</div>
    <div class="vc-title">Geschenkgutschein</div>
    <div class="vc-recipient">Für <strong>${v.recipientName}</strong></div>
    <div class="vc-amount">${this.fmt(v.amount)}</div>
    ${msgHtml}
    <div class="vc-divider"></div>
    <div class="vc-code-label">Gutschein-Code</div>
    <div class="vc-code">${v.code}</div>
    <div class="vc-expiry">Gültig bis ${this.fmtDate(v.expiresAt)}</div>
  </div>
  <div class="vc-footer">
    Dieser Gutschein ist beim Restaurant einzulösen. Keine Barauszahlung möglich.
  </div>
</div>
<script>window.onload = () => window.print();<\/script>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ─── Design anwenden ──────────────────────────────────────────────────────
  private applyDesign(d: GutscheinDesignSettings): void {
    const root = document.documentElement.style;

    // Font
    const fontStacks: Record<string, string> = {
      system:  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      modern:  '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
      classic: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      serif:   'Georgia, "Times New Roman", Times, serif',
      rounded: '"Avenir Next", "Avenir", "Nunito", sans-serif',
      mono:    '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
    };
    const fontSizes: Record<string, string> = { compact: '12px', standard: '14px', large: '16px' };
    root.setProperty('--w-font', fontStacks[d.fontFamily] ?? fontStacks['system']);
    root.setProperty('--w-font-size-base', fontSizes[d.fontSize] ?? '14px');

    // Radius — card gecappt bei 20px, Buttons/Inputs bei 14px
    const radiiMap: Record<string, number> = { square: 4, soft: 10, pill: 999 };
    const r = radiiMap[d.radius] ?? 10;
    root.setProperty('--w-radius',      `${r}px`);
    root.setProperty('--w-radius-card', `${Math.min(r, 20)}px`);
    root.setProperty('--w-radius-sm',   `${Math.min(r, 14)}px`);

    // Primärfarbe
    root.setProperty('--w-color-primary', d.colorPrimary);
    const pm = d.colorPrimary.replace('#', '');
    if (pm.length === 6) {
      root.setProperty('--w-color-primary-rgb',
        `${parseInt(pm.slice(0,2),16)}, ${parseInt(pm.slice(2,4),16)}, ${parseInt(pm.slice(4,6),16)}`);
    }

    // Textfarbe
    root.setProperty('--w-color-text', d.colorText);

    // Hintergrund
    const bgColor = d.bgColor ?? '#f4f5f7';
    if (d.bgMode === 'image' && d.bgImage) {
      root.setProperty('--w-color-bg', 'transparent');
      document.body.style.backgroundImage = `url(${d.bgImage})`;
      document.body.style.backgroundSize  = 'cover';
      document.body.style.backgroundPosition = 'center';
    } else {
      root.setProperty('--w-color-bg', bgColor);
      document.body.style.backgroundImage = '';
    }

    // Dark-Mode-Erkennung → Surface, Border, Shadow anpassen
    const hx = bgColor.replace('#', '');
    const isDark = hx.length === 6
      ? (parseInt(hx.slice(0,2),16)*0.299 + parseInt(hx.slice(2,4),16)*0.587 + parseInt(hx.slice(4,6),16)*0.114) / 255 < 0.5
      : false;

    if (isDark) {
      root.setProperty('--w-color-surface',      'rgba(255,255,255,0.08)');
      root.setProperty('--w-color-surface-soft',  'rgba(255,255,255,0.05)');
      root.setProperty('--w-color-text-muted',    'rgba(255,255,255,0.55)');
      root.setProperty('--w-color-border',        'rgba(255,255,255,0.12)');
      root.setProperty('--w-shadow',              '0 4px 24px rgba(0,0,0,0.4)');
    } else {
      root.setProperty('--w-color-surface',      '#ffffff');
      root.setProperty('--w-color-surface-soft',  '#f8f9fa');
      root.setProperty('--w-color-text-muted',    'rgba(17,17,17,0.55)');
      root.setProperty('--w-color-border',        'rgba(17,17,17,0.10)');
      root.setProperty('--w-shadow',              '0 4px 20px rgba(0,0,0,0.06)');
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  copyCode(): void {
    if (!this.result) return;
    navigator.clipboard.writeText(this.result.code).then(() => {
      this.copiedCode = true;
      setTimeout(() => this.copiedCode = false, 2500);
    });
  }
  fmt(n: number): string {
    return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 });
  }
  fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
