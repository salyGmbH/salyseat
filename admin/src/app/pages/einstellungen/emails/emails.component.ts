import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

type MailSetting = {
  label: string;
  key: string;
  enabled: boolean;
};

@Component({
  selector: 'app-emails',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './emails.component.html',
  styleUrl: './emails.component.scss'
})
export class EmailsComponent {

  // =========================
  // 🔥 STATE
  // =========================
  mailInfo = false;
  languageInfo = false;

saved = false;

reminderTime: '2h' | '24h' = '2h';
language: 'de' | 'en' | 'it' = 'de';

emailMode: 'dark' | 'light' = 'dark';

primaryColor = '#ff6b2c';
highlightColor = '#ff6b2c';

backgroundColor = '#0E0E11';
cardColor = '#1F232C';

borderRadius = 16;

fontFamily = 'Inter';

footerText = '';
infoText = '';
signature = '';

instagram = '';
facebook = '';
tiktok = '';

logoFile: File | null = null;
headerFile: File | null = null;

attachments: any[] = [];


  mailSettings: MailSetting[] = [
    { key: 'confirmation', label: 'Reservierungsbestätigung', enabled: true },
    { key: 'reminder', label: 'Erinnerung vor Termin', enabled: true },
    { key: 'cancel', label: 'Stornierungsbestätigung', enabled: true },
    { key: 'no_show', label: 'No-Show Info', enabled: false },
  ];

  // =========================
  // 🔥 ACTIONS
  // =========================
  toggleMailInfo() {
    this.mailInfo = !this.mailInfo;
    this.languageInfo = false;
  }

  toggleLanguageInfo() {
    this.languageInfo = !this.languageInfo;
    this.mailInfo = false;
  }

  setReminder(time: '2h' | '24h') {
    this.reminderTime = time;
  }

setLanguage(lang: 'de' | 'en' | 'it') {
  this.language = lang;
}

setEmailMode(mode: 'dark' | 'light') {
  this.emailMode = mode;

  if (mode === 'dark') {

    this.backgroundColor = '#0E0E11';
    this.cardColor = '#1F232C';

  } else {

    this.backgroundColor = '#F5F7FA';
    this.cardColor = '#FFFFFF';

  }
}

onLogoUpload(event: any) {
  this.logoFile = event.target.files[0];
}

onHeaderUpload(event: any) {
  this.headerFile = event.target.files[0];
}

onAttachmentsSelected(event: any) {

  const files = event.target.files;

  for (let file of files) {

    this.attachments.push({
      name: file.name,
      file,
      assignedMails: {}
    });

  }
}

save() {

  const settings = {

    mailSettings: this.mailSettings,

    reminder: this.reminderTime,

    language: this.language,

    design: {
      mode: this.emailMode,
      primaryColor: this.primaryColor,
      highlightColor: this.highlightColor,
      backgroundColor: this.backgroundColor,
      cardColor: this.cardColor
    }

  };

  console.log(settings);

  this.saved = true;

  setTimeout(() => {
    this.saved = false;
  }, 2000);
}
}