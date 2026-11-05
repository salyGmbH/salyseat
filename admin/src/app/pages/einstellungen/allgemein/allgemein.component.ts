import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

type ThemeMode = 'light' | 'dark' | 'system';

@Component({
  selector: 'app-allgemein',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './allgemein.component.html',
  styleUrl: './allgemein.component.scss'
})
export class AllgemeinComponent {

  theme: ThemeMode = 'system';
  themeInfo = false;
  themeSaved = false;

  constructor() {
    const saved = localStorage.getItem('theme') as ThemeMode | null;
    if (saved) {
      this.theme = saved;
      this.applyTheme(saved);
    } else {
      this.applyTheme('system');
    }
  }

  setTheme(mode: ThemeMode) {
    this.theme = mode;
    this.applyTheme(mode);
  }

  toggleThemeInfo() {
    this.themeInfo = !this.themeInfo;
  }

  saveTheme() {
    localStorage.setItem('theme', this.theme);

    this.themeSaved = true;
    setTimeout(() => this.themeSaved = false, 2000);
  }

  applyTheme(mode: ThemeMode) {
    const body = document.body;

    if (mode === 'dark') {
      body.classList.add('dark-theme');
    } else if (mode === 'light') {
      body.classList.remove('dark-theme');
    } else {
      // system
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      body.classList.toggle('dark-theme', prefersDark);
    }
  }
}