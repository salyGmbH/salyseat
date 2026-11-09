import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

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
export class EmailsComponent {

  // ── UI State ──────────────────────────────────────────────────────────────
  mailInfo     = false;
  languageInfo = false;
  saved        = false;

  // ── Einstellungen ─────────────────────────────────────────────────────────
  reminderTime: '2h' | '24h' = '2h';
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

  /** Literal placeholder labels — displayed as static text in the preview/fixed-block.
   *  Stored as strings so Angular does NOT try to evaluate them as template expressions. */
  readonly ph = {
    vorname:  '{{Vorname}}',
    datum:    '{{Datum}}',
    uhrzeit:  '{{Uhrzeit}}',
    personen: '{{Personen}}',
    raum:     '{{Raum}}',
  };

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

  // Zeigt Details-Karte im Preview: nur bei Bestätigung + Erinnerung
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

  setReminder(time: '2h' | '24h') { this.reminderTime = time; }
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
    const payload = {
      mailSettings:    this.mailSettings,
      reminder:        this.reminderTime,
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
    console.log('Email settings saved:', payload);
    this.saved = true;
    setTimeout(() => this.saved = false, 2000);
  }
}
