import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { ReservationTimingService } from '../../../services/reservation-timing.service';
import {
  DEFAULT_RESERVATION_TIMING,
  ReservationTimingSettings,
  TenantSettingsService,
} from '../../../services/tenant-settings.service';
import { GetraenkeReminderService } from '../../../services/getraenke-reminder.service';

interface DurationPreset {
  label: string;
  minutes: number;
}

@Component({
  selector: 'app-reservierungen',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, TranslateModule],
  templateUrl: './reservierungen.component.html',
  styleUrl: './reservierungen.component.scss'
})
export class ReservierungenComponent {

  private readonly timing          = inject(ReservationTimingService);
  private readonly getraenke       = inject(GetraenkeReminderService);
  private readonly tenantSettings  = inject(TenantSettingsService);

  // ────────────────────────────────────────────────────────────────
  //  Lokales Bearbeitungs-State (initial aus dem Service gefüttert)
  // ────────────────────────────────────────────────────────────────
  defaultDuration = signal<number>(this.timing.defaultDurationMinutes());
  autoExpire      = signal<boolean>(this.timing.autoExpireEnabled());
  cleanupOn       = signal<boolean>(this.timing.cleanupEnabled());
  cleanupMinutes  = signal<number>(this.timing.cleanupMinutes());

  // ── Info-Panels (je Section) ─────────────────────────────────────────────────
  info1 = signal(false); // Standard-Reservierungsdauer
  info2 = signal(false); // Status-Auto-Wechsel
  info3 = signal(false); // Clean-up-Zeit
  info4 = signal(false); // Getränke-Erinnerung
  info5 = signal(false); // VIP-Schwelle

  // ── Getränke-Erinnerung ──────────────────────────────────────────────────────
  getraenkeOn      = signal<boolean>(this.getraenke.enabled());
  getraenkeMinutes = signal<number>(this.getraenke.minutes());

  // ── No-Show Auto-Block ────────────────────────────────────────────────────────
  noShowThreshold     = signal<number | null>(null);
  savedNoShowThreshold = signal<boolean>(false);
  readonly noShowPresets = [1, 2, 3, 5];

  constructor() {
    this.tenantSettings.load().subscribe(s => {
      this.noShowThreshold.set(s.noShowAutoBlockThreshold ?? null);
    });
  }

  readonly getraenkePresets = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];

  toggleGetraenke(): void { this.getraenkeOn.update(v => !v); }
  setGetraenke(min: number): void { this.getraenkeMinutes.set(min); }

  // ── VIP-Schwelle ─────────────────────────────────────────────────────────────
  vipThreshold      = signal<number>(this.tenantSettings.snapshot?.vipThreshold ?? 5);
  vipThresholdInput = this.tenantSettings.snapshot?.vipThreshold ?? 5;
  savedVipThreshold = signal<boolean>(false);

  // Speichern-Feedback pro Card
  savedDuration   = signal<boolean>(false);
  savedAutoExpire = signal<boolean>(false);
  savedCleanup    = signal<boolean>(false);
  savedGetraenke  = signal<boolean>(false);

  // Praktische Presets, die Restaurants typischerweise verwenden.
  readonly durationPresets: DurationPreset[] = [
    { label: '60 min',  minutes: 60  },
    { label: '90 min',  minutes: 90  },
    { label: '2 Std.',  minutes: 120 },
    { label: '2,5 Std.', minutes: 150 },
    { label: '3 Std.',  minutes: 180 },
  ];

  readonly cleanupPresets: DurationPreset[] = [
    { label: '10 min', minutes: 10 },
    { label: '15 min', minutes: 15 },
    { label: '20 min', minutes: 20 },
    { label: '30 min', minutes: 30 },
  ];

  // Anschauliche Berechnung: bei einer 19:00-Reservierung wäre das …
  readonly previewExample = computed(() => {
    const start = new Date(); start.setHours(19, 0, 0, 0);
    const endRes = new Date(start.getTime() + this.defaultDuration() * 60_000);
    const endSlot = new Date(endRes.getTime() + (this.cleanupOn() ? this.cleanupMinutes() : 0) * 60_000);
    const fmt = (d: Date) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    return {
      start:    fmt(start),
      endRes:   fmt(endRes),
      endSlot:  fmt(endSlot),
    };
  });

  // ────────────────────────────────────────────────────────────────
  //  Aktionen
  // ────────────────────────────────────────────────────────────────
  setDuration(min: number): void {
    if (min < 15) min = 15;
    if (min > 480) min = 480;
    this.defaultDuration.set(Math.round(min));
  }

  setCleanup(min: number): void {
    if (min < 5) min = 5;
    if (min > 120) min = 120;
    this.cleanupMinutes.set(Math.round(min));
  }

  toggleAutoExpire(): void { this.autoExpire.update(v => !v); }
  toggleCleanup():    void { this.cleanupOn.update(v => !v); }

  setNoShowThreshold(val: number | null): void {
    this.noShowThreshold.set(val);
  }

  saveNoShowThreshold(): void {
    this.tenantSettings.save({
      ...this.tenantSettings.snapshot,
      noShowAutoBlockThreshold: this.noShowThreshold(),
    }).subscribe();
    this.savedNoShowThreshold.set(true);
    setTimeout(() => this.savedNoShowThreshold.set(false), 2000);
  }

  resetDefaults(): void {
    this.defaultDuration.set(DEFAULT_RESERVATION_TIMING.defaultDurationMinutes);
    this.autoExpire.set(    DEFAULT_RESERVATION_TIMING.autoExpireEnabled);
    this.cleanupOn.set(     DEFAULT_RESERVATION_TIMING.cleanupEnabled);
    this.cleanupMinutes.set(DEFAULT_RESERVATION_TIMING.cleanupMinutes);
  }

  saveDuration(): void {
    this.timing.save({ defaultDurationMinutes: this.defaultDuration() });
    this.savedDuration.set(true);
    setTimeout(() => this.savedDuration.set(false), 2000);
  }

  saveAutoExpire(): void {
    this.timing.save({ autoExpireEnabled: this.autoExpire() });
    this.savedAutoExpire.set(true);
    setTimeout(() => this.savedAutoExpire.set(false), 2000);
  }

  saveCleanup(): void {
    this.timing.save({ cleanupEnabled: this.cleanupOn(), cleanupMinutes: this.cleanupMinutes() });
    this.savedCleanup.set(true);
    setTimeout(() => this.savedCleanup.set(false), 2000);
  }

  saveGetraenke(): void {
    this.getraenke.saveSettings({ enabled: this.getraenkeOn(), minutes: this.getraenkeMinutes() });
    this.savedGetraenke.set(true);
    setTimeout(() => this.savedGetraenke.set(false), 2000);
  }

  saveVipThreshold(): void {
    const t = Math.max(1, Math.min(100, this.vipThresholdInput));
    this.vipThreshold.set(t);
    this.tenantSettings.save({ ...this.tenantSettings.snapshot, vipThreshold: t }).subscribe();
    this.savedVipThreshold.set(true);
    setTimeout(() => this.savedVipThreshold.set(false), 2000);
  }
}
