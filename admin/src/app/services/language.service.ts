import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type AppLang = 'de' | 'en';

const STORAGE_KEY = 'salyseat_lang';
const SUPPORTED: AppLang[] = ['de', 'en'];
const DEFAULT: AppLang = 'de';

@Injectable({ providedIn: 'root' })
export class LanguageService {

  constructor(private translate: TranslateService) {}

  init(): void {
    this.translate.addLangs(SUPPORTED);
    this.translate.setDefaultLang(DEFAULT);
    this.translate.use(this.stored());
  }

  use(lang: AppLang): void {
    localStorage.setItem(STORAGE_KEY, lang);
    this.translate.use(lang);
  }

  current(): AppLang {
    return (this.translate.currentLang as AppLang) ?? this.stored();
  }

  stored(): AppLang {
    const v = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.includes(v as AppLang) ? (v as AppLang) : DEFAULT;
  }
}