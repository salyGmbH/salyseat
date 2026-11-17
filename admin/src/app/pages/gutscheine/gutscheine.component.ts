import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { switchMap } from 'rxjs';
import { of } from 'rxjs';
import { GutscheineService, Voucher, VoucherStatus, CreateVoucherDto, VoucherImage, PaymentMethod } from '../../services/gutscheine.service';
import { GuestsService, Guest } from '../../services/guests.service';
import { TenantSettingsService } from '../../services/tenant-settings.service';

type FilterTab = 'all' | 'active' | 'redeemed' | 'expired';

@Component({
  selector: 'app-gutscheine',
  standalone: true,
  imports: [FormsModule, DecimalPipe, MatIconModule, TranslateModule],
  templateUrl: './gutscheine.component.html',
  styleUrl: './gutscheine.component.scss',
})
export class GutscheineComponent implements OnInit {
  private readonly svc            = inject(GutscheineService);
  private readonly guests         = inject(GuestsService);
  private readonly translate      = inject(TranslateService);
  private readonly tenantSettings = inject(TenantSettingsService);

  readonly vouchers = signal<Voucher[]>([]);
  readonly loading  = signal(true);
  readonly filter   = signal<FilterTab>('all');

  // Modal: Gutschein erstellen
  showCreateModal   = false;
  creating          = false;
  emailToRecipient  = true;
  emailToBuyer      = false;   // im Admin gibt es keinen "Käufer" — standardmäßig aus
  draft: { amount: number; recipientName: string; recipientEmail: string; message: string; expiresAt: string; imageId: string | null } = this.emptyDraft();

  // Kunden-Autocomplete
  guestSuggestions = signal<Guest[]>([]);
  showSuggestions  = signal(false);
  private _suggestTimer: ReturnType<typeof setTimeout> | null = null;

  // Modal: Gutschein einlösen
  showRedeemModal = false;
  redeemCode = '';
  redeemState: 'idle' | 'found' | 'not_found' | 'already_done' = 'idle';
  redeemTarget: Voucher | null = null;

  // UI-Feedback
  copiedLink = false;
  copiedCode: string | null = null;

  readonly widgetUrl = computed(() => {
    const key = this.tenantSettings.publicKey();
    return `${location.origin.replace(':4200', ':4201')}/gutschein?key=${key}`;
  });

  readonly presetAmounts = [25, 50, 75, 100, 150, 200];

  readonly filtered = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.vouchers() : this.vouchers().filter(v => v.status === f);
  });

  readonly stats = computed(() => {
    const all = this.vouchers();
    return {
      active:   all.filter(v => v.status === 'active').length,
      redeemed: all.filter(v => v.status === 'redeemed').length,
      total:    all.reduce((s, v) => s + v.amount, 0),
    };
  });

  readonly TABS: { key: FilterTab; label: string }[] = [
    { key: 'all',      label: 'gutscheine.tab_all' },
    { key: 'active',   label: 'gutscheine.tab_active' },
    { key: 'redeemed', label: 'gutscheine.tab_redeemed' },
    { key: 'expired',  label: 'gutscheine.tab_expired' },
  ];

  // ── Bilder ───────────────────────────────────────────────────────────────
  readonly images       = signal<VoucherImage[]>([]);
  readonly activeImages = computed(() => this.images().filter(i => i.active));

  // ── Zahlungsmethoden ─────────────────────────────────────────────────────
  readonly paymentMethods = signal<PaymentMethod[]>([]);

  // ── Postversand ───────────────────────────────────────────────────────────
  readonly postalEnabled      = signal(false);
  readonly postalShippingCost = signal<number | null>(null);
  postalSaving = false;
  postalSaved  = false;
  showImageModal = false;
  imgDraft = { name: '', url: '' };
  imgTab: 'url' | 'file' = 'url';
  imgFilePreview: string | null = null;
  imgFile: File | null = null;
  imgUploading = false;

  ngOnInit(): void {
    if (!this.tenantSettings.publicKey()) {
      this.tenantSettings.load().subscribe();
    }
    this.svc.list().subscribe(list => {
      this.vouchers.set(list);
      this.loading.set(false);
    });
    this.svc.listImages().subscribe(imgs => this.images.set(imgs));
    this.svc.listPaymentMethods().subscribe(pm => this.paymentMethods.set(pm));
    this.svc.getPostalConfig().subscribe(cfg => {
      this.postalEnabled.set(cfg.postalEnabled);
      this.postalShippingCost.set(cfg.postalShippingCost);
    });
  }

  // ── Erstellen ─────────────────────────────────────────────────────────────
  openCreate(): void {
    this.draft = this.emptyDraft();
    this.emailToRecipient = true;
    this.emailToBuyer     = false;
    this.guestSuggestions.set([]);
    this.showSuggestions.set(false);
    this.showCreateModal = true;
  }

  saveVoucher(): void {
    if (!this.draft.recipientName.trim() || !this.draft.amount) return;
    this.creating = true;
    this.svc.create(this.draft as CreateVoucherDto).subscribe(v => {
      this.vouchers.update(list => [v, ...list]);
      this.showCreateModal = false;
      this.creating = false;
    });
  }

  // ── Kunden-Autocomplete ───────────────────────────────────────────────────
  onRecipientInput(value: string): void {
    this.draft.recipientName = value;
    if (this._suggestTimer) clearTimeout(this._suggestTimer);
    if (value.trim().length < 2) { this.showSuggestions.set(false); return; }
    this._suggestTimer = setTimeout(() => {
      this.guests.load({ search: value.trim(), limit: 6 }).subscribe(res => {
        this.guestSuggestions.set(res.guests);
        this.showSuggestions.set(res.guests.length > 0);
      });
    }, 200);
  }

  selectGuest(g: Guest): void {
    this.draft.recipientName  = g.name;
    this.draft.recipientEmail = g.email ?? '';
    this.showSuggestions.set(false);
  }

  hideSuggestions(): void {
    setTimeout(() => this.showSuggestions.set(false), 150);
  }

  // ── Einlösen ──────────────────────────────────────────────────────────────
  openRedeem(): void {
    this.redeemCode = '';
    this.redeemState = 'idle';
    this.redeemTarget = null;
    this.showRedeemModal = true;
  }

  lookupCode(): void {
    const code = this.redeemCode.trim().toUpperCase();
    if (!code) return;
    this.svc.lookupCode(code).subscribe(v => {
      if (!v)                    { this.redeemState = 'not_found'; this.redeemTarget = null; return; }
      if (v.status !== 'active') { this.redeemState = 'already_done'; this.redeemTarget = v; return; }
      this.redeemState = 'found';
      this.redeemTarget = v;
    });
  }

  confirmRedeem(): void {
    if (!this.redeemTarget) return;
    this.svc.redeem(this.redeemTarget.id).subscribe(updated => {
      this.vouchers.update(list => list.map(x => x.id === updated.id ? updated : x));
      this.showRedeemModal = false;
    });
  }

  // ── Postversand-Konfiguration ─────────────────────────────────────────────
  togglePostal(): void {
    const newVal = !this.postalEnabled();
    this.postalEnabled.set(newVal);
    this.savePostalConfig();
  }

  onShippingCostChange(val: string): void {
    const n = parseFloat(val.replace(',', '.'));
    this.postalShippingCost.set(!isNaN(n) && n >= 0 ? Math.round(n * 100) / 100 : null);
  }

  savePostalConfig(): void {
    this.postalSaving = true;
    this.svc.savePostalConfig({
      postalEnabled:      this.postalEnabled(),
      postalShippingCost: this.postalShippingCost(),
    }).subscribe(cfg => {
      this.postalEnabled.set(cfg.postalEnabled);
      this.postalShippingCost.set(cfg.postalShippingCost);
      this.postalSaving = false;
      this.postalSaved  = true;
      setTimeout(() => this.postalSaved = false, 2000);
    });
  }

  // ── Versand bestätigen ────────────────────────────────────────────────────
  markShipped(v: Voucher): void {
    this.svc.markShipped(v.id).subscribe(updated => {
      this.vouchers.update(list => list.map(x => x.id === updated.id ? updated : x));
    });
  }

  // ── Löschen ───────────────────────────────────────────────────────────────
  remove(v: Voucher): void {
    if (!confirm(this.translate.instant('gutscheine.btn_delete') + ': ' + v.code + '?')) return;
    this.svc.delete(v.id).subscribe(() => {
      this.vouchers.update(list => list.filter(x => x.id !== v.id));
    });
  }

  // ── Kopieren ──────────────────────────────────────────────────────────────
  copyLink(): void {
    navigator.clipboard.writeText(this.widgetUrl()).then(() => {
      this.copiedLink = true;
      setTimeout(() => this.copiedLink = false, 2500);
    });
  }

  copyCode(code: string, e: Event): void {
    e.stopPropagation();
    navigator.clipboard.writeText(code).then(() => {
      this.copiedCode = code;
      setTimeout(() => this.copiedCode = null, 2500);
    });
  }

  // ── Formatierung ──────────────────────────────────────────────────────────
  fmt(n: number): string {
    return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 });
  }
  fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  fmtDateTime(iso: string): string {
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // ── Bild-Management ───────────────────────────────────────────────────────
  openImageModal(): void {
    this.imgDraft = { name: '', url: '' };
    this.imgTab = 'url';
    this.imgFilePreview = null;
    this.imgFile = null;
    this.showImageModal = true;
  }

  onImgFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.imgFile = file;
    if (!this.imgDraft.name) this.imgDraft.name = file.name.replace(/\.[^.]+$/, '');
    const reader = new FileReader();
    reader.onload = () => { this.imgFilePreview = reader.result as string; };
    reader.readAsDataURL(file);
  }

  saveImage(): void {
    const name = this.imgDraft.name.trim();
    if (!name) return;
    this.imgUploading = true;

    const url$ = this.imgTab === 'file'
      ? (this.imgFile ? this.svc.uploadFile(this.imgFile) : of(''))
      : of(this.imgDraft.url.trim());

    url$.pipe(
      switchMap(url => {
        if (!url) { this.imgUploading = false; return of(null); }
        return this.svc.addImage({ name, url });
      }),
    ).subscribe(img => {
      if (img) this.images.update(list => [...list, img]);
      this.showImageModal = false;
      this.imgUploading = false;
    });
  }

  toggleImage(img: VoucherImage): void {
    this.svc.toggleImage(img.id).subscribe(updated => {
      this.images.update(list => list.map(x => x.id === updated.id ? updated : x));
    });
  }

  togglePaymentMethod(pm: PaymentMethod): void {
    this.svc.togglePaymentMethod(pm.id).subscribe(updated => {
      this.paymentMethods.update(list => list.map(x => x.id === updated.id ? updated : x));
    });
  }

  removeImage(img: VoucherImage): void {
    if (!confirm(this.translate.instant('gutscheine.confirm_delete_img'))) return;
    this.svc.deleteImage(img.id).subscribe(() => {
      this.images.update(list => list.filter(x => x.id !== img.id));
    });
  }

  private emptyDraft() {
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 1);
    return { amount: 50, recipientName: '', recipientEmail: '', message: '', expiresAt: exp.toISOString().split('T')[0], imageId: null as string | null };
  }
}
