import { Component, inject, signal, effect } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { LanguageService, AppLang } from '../../../services/language.service';

@Component({
  selector: 'app-sprachen',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './sprachen.component.html',
  styleUrl: './sprachen.component.scss'
})
export class SprachenComponent {
  private langService = inject(LanguageService);

  current = signal<AppLang>(this.langService.current());
  saved   = signal(false);

  select(lang: AppLang): void {
    if (this.current() === lang) return;
    this.current.set(lang);
    this.langService.use(lang);
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2500);
  }
}
