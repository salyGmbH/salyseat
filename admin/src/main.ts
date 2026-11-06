import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { applyStoredThemeEarly } from './app/services/theme.service';

registerLocaleData(localeDe);

// Theme möglichst früh anwenden, damit die erste Page kein Wrong-Theme-Flash hat
applyStoredThemeEarly();

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
