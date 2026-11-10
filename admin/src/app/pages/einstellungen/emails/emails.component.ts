import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { TenantSettingsService } from '../../../services/tenant-settings.service';

type MailSetting = {
  label: string;
  key: string;
  enabled: boolean;
};

type MailContent = {
  footerText: string;
  infoText: string;
  signature: string;
};

@Component({
  selector: 'app-emails',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, TranslateModule],
  templateUrl: './emails.component.html',
  styleUrl: './emails.component.scss'
})
export class EmailsComponent implements OnInit {
  private readonly tenantSettings = inject(TenantSettingsService);

  // ── UI State ──────────────────────────────────────────────────────────────
  mailInfo     = false;
  languageInfo = false;
  saved        = false;
  saving       = false;

  // ── Einstellungen ─────────────────────────────────────────────────────────
  reminderTime: '3min' | '2h' | '24h' = '2h';
  language: 'de' | 'en' | 'it' = 'de';

  // ── Design ────────────────────────────────────────────────────────────────
  emailMode: 'dark' | 'light' = 'dark';
  primaryColor   = '#ff6b2c';
  highlightColor = '#ff6b2c';
  backgroundColor = '#0E0E11';
  cardColor       = '#1F232C';
  borderRadius    = 16;
  fontFamily      = 'Inter';

  // ── Globale Social Links ──────────────────────────────────────────────────
  instagram = '';
  facebook  = '';
  tiktok    = '';

  // ── Logo / Header ─────────────────────────────────────────────────────────
  logoFile:   File | null = null;
  headerFile: File | null = null;
  logoPreview:   string | null = null;
  headerPreview: string | null = null;

  // ── Anhänge ───────────────────────────────────────────────────────────────
  attachments: { name: string; file: File; assignedMails: Record<string, boolean> }[] = [];

  // ── Mail-Einstellungen ────────────────────────────────────────────────────
  mailSettings: MailSetting[] = [
    { key: 'confirmation', label: 'Reservierungsbestätigung', enabled: true  },
    { key: 'reminder',     label: 'Erinnerung vor Termin',   enabled: true  },
    { key: 'cancel',       label: 'Stornierungsbestätigung', enabled: true  },
    { key: 'no_show',      label: 'No-Show Info',            enabled: false },
  ];

  // ── Inhalt — pro E-Mail-Typ ───────────────────────────────────────────────
  selectedContentKey = 'confirmation';

  perMailContent: Record<string, MailContent> = {
    confirmation: {
      footerText: 'Vielen Dank für Ihre Reservierung. Wir freuen uns auf Ihren Besuch!',
      infoText:   '',
      signature:  'Mit freundlichen Grüßen,\nIhr Restaurantteam',
    },
    reminder: {
      footerText: 'Wir freuen uns auf Ihren Besuch!',
      infoText:   '',
      signature:  'Mit freundlichen Grüßen,\nIhr Restaurantteam',
    },
    cancel: {
      footerText: 'Wir hoffen, Sie bald wieder bei uns begrüßen zu dürfen.',
      infoText:   '',
      signature:  'Mit freundlichen Grüßen,\nIhr Restaurantteam',
    },
    no_show: {
      footerText: '',
      infoText:   'Wir freuen uns jederzeit auf eine neue Reservierung.',
      signature:  'Mit freundlichen Grüßen,\nIhr Restaurantteam',
    },
  };

  get currentMailContent(): MailContent {
    return this.perMailContent[this.selectedContentKey];
  }

  readonly ph = {
    vorname:  '{{Vorname}}',
    datum:    '{{Datum}}',
    uhrzeit:  '{{Uhrzeit}}',
    personen: '{{Personen}}',
    raum:     '{{Raum}}',
  };

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.tenantSettings.load().subscribe(s => {
      const es = s.emailSettings;
      if (!es) return;

      if (es.mailSettings?.length) {
        // Gespeicherte enabled-Flags auf die Standard-Liste anwenden
        this.mailSettings = this.mailSettings.map(ms => {
          const saved = es.mailSettings!.find(x => x.key === ms.key);
          return saved ? { ...ms, enabled: saved.enabled } : ms;
        });
      }
      if (es.reminderTime) this.reminderTime = es.reminderTime;
      if (es.language)     this.language     = es.language;
      if (es.design) {
        const d = es.design;
        if (d.mode)            this.emailMode       = d.mode;
        if (d.primaryColor)    this.primaryColor    = d.primaryColor;
        if (d.highlightColor)  this.highlightColor  = d.highlightColor;
        if (d.backgroundColor) this.backgroundColor = d.backgroundColor;
        if (d.cardColor)       this.cardColor       = d.cardColor;
        if (d.borderRadius != null) this.borderRadius = d.borderRadius;
        if (d.fontFamily)      this.fontFamily      = d.fontFamily;
      }
      if (es.content) {
        for (const key of Object.keys(es.content)) {
          if (this.perMailContent[key]) {
            this.perMailContent[key] = { ...this.perMailContent[key], ...es.content[key] };
          }
        }
      }
      if (es.social) {
        this.instagram = es.social.instagram ?? '';
        this.facebook  = es.social.facebook  ?? '';
        this.tiktok    = es.social.tiktok    ?? '';
      }
    });
  }

  // Fester, nicht editierbarer Haupttext je Mail-Typ
  getFixedLines(key: string): string[] {
    const map: Record<string, string[]> = {
      confirmation: [
        'Ihre Reservierung wurde erfolgreich bestätigt.',
        'Wir freuen uns, Sie bei uns begrüßen zu dürfen.',
        '',
        'Ihre Reservierungsdetails finden Sie unten.',
      ],
      reminder: [
        'Wir möchten Sie freundlich an Ihren bevorstehenden',
        'Termin erinnern.',
        '',
        'Ihre Reservierungsdetails auf einen Blick:',
      ],
      cancel: [
        'Ihre Reservierung wurde storniert.',
        '',
        'Wir hoffen, Sie bald wieder bei uns begrüßen zu dürfen.',
      ],
      no_show: [
        'Leider konnten wir Sie heute nicht bei uns begrüßen.',
        '',
        'Bei Fragen stehen wir Ihnen jederzeit gerne zur Verfügung.',
      ],
    };
    return map[key] ?? [];
  }

  showDetailsCard(key: string): boolean {
    return key === 'confirmation' || key === 'reminder';
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  toggleMailInfo() {
    this.mailInfo     = !this.mailInfo;
    this.languageInfo = false;
  }

  toggleLanguageInfo() {
    this.languageInfo = !this.languageInfo;
    this.mailInfo     = false;
  }

  setReminder(time: '3min' | '2h' | '24h') { this.reminderTime = time; }
  setLanguage(lang: 'de' | 'en' | 'it') { this.language = lang; }

  setEmailMode(mode: 'dark' | 'light') {
    this.emailMode = mode;
    if (mode === 'dark') {
      this.backgroundColor = '#0E0E11';
      this.cardColor       = '#1F232C';
    } else {
      this.backgroundColor = '#F5F7FA';
      this.cardColor       = '#FFFFFF';
    }
  }

  onLogoUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.logoFile = file;
    const reader = new FileReader();
    reader.onload = e => this.logoPreview = e.target?.result as string;
    reader.readAsDataURL(file);
  }

  onHeaderUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.headerFile = file;
    const reader = new FileReader();
    reader.onload = e => this.headerPreview = e.target?.result as string;
    reader.readAsDataURL(file);
  }

  onAttachmentsSelected(event: Event) {
    const files = (event.target as HTMLInputElement).files;
    if (!files) return;
    for (const file of Array.from(files)) {
      this.attachments.push({ name: file.name, file, assignedMails: {} });
    }
  }

  save() {
    this.saving = true;
    const snapshot = this.tenantSettings.snapshot;
    const emailSettings = {
      mailSettings:    this.mailSettings.map(({ key, enabled }) => ({ key, enabled })),
      reminderTime:    this.reminderTime,
      language:        this.language,
      design: {
        mode:            this.emailMode,
        primaryColor:    this.primaryColor,
        highlightColor:  this.highlightColor,
        backgroundColor: this.backgroundColor,
        cardColor:       this.cardColor,
        borderRadius:    this.borderRadius,
        fontFamily:      this.fontFamily,
      },
      content: this.perMailContent,
      social: { instagram: this.instagram, facebook: this.facebook, tiktok: this.tiktok },
    };

    this.tenantSettings.save({ ...snapshot, emailSettings }).subscribe({
      next: () => {
        this.saving = false;
        this.saved  = true;
        setTimeout(() => this.saved = false, 2000);
      },
      error: () => {
        this.saving = false;
      },
    });
  }
}
