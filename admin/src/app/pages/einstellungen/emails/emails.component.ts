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

  mailInfo = false;
  languageInfo = false;

  saved = false;

  reminderTime: '2h' | '24h' = '2h';
  language: 'de' | 'en' | 'it' = 'de';

  mailSettings: MailSetting[] = [
    { key: 'confirmation', label: 'Reservierungsbestätigung', enabled: true },
    { key: 'reminder', label: 'Erinnerung vor Termin', enabled: true },
    { key: 'cancel', label: 'Stornierungsbestätigung', enabled: true },
    { key: 'no_show', label: 'No-Show Info', enabled: false },
    { key: 'follow_up', label: 'Follow-Up', enabled: false },
  ];

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

  save() {
    console.log('Mail Settings:', this.mailSettings);
    console.log('Reminder:', this.reminderTime);
    console.log('Language:', this.language);

    this.saved = true;
    setTimeout(() => this.saved = false, 2000);
  }
}