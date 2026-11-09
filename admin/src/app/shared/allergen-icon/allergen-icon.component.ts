import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Renders one of the 14 EU-mandated allergen pictograms.
 * The outer circle uses the color passed via [color]; the symbol inside is white.
 * Matches the look of the status-kennzeichnungen allergen view.
 */
@Component({
  selector: 'app-allergen-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 24 24'" fill="none"
         [attr.width]="size" [attr.height]="size" [attr.aria-hidden]="true">
      <circle cx="12" cy="12" r="11" [attr.fill]="color"/>

      @switch (key) {

        <!-- 1. Gluten – Weizenähre -->
        @case ('gluten') {
          <line x1="12" y1="5" x2="12" y2="19" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
          <path d="M12 8 Q15 7 15 10 Q15 12 12 11" fill="white"/>
          <path d="M12 11 Q15 10 15 13 Q15 15 12 14" fill="white"/>
          <path d="M12 8 Q9 7 9 10 Q9 12 12 11" fill="white"/>
          <path d="M12 11 Q9 10 9 13 Q9 15 12 14" fill="white"/>
        }

        <!-- 2. Krebstiere – Garnele -->
        @case ('crustaceans') {
          <path d="M6.5 12 Q 9 7 14 7 Q 18 9 17.5 12 Q 17 15 14 16 Q 10 16 8 14 Z" fill="white"/>
          <path d="M14 16 L 17.5 18.5 L 16 15.5 Z" fill="white"/>
          <line x1="7.5" y1="9.5" x2="5"   y2="6"   stroke="white" stroke-width="1" stroke-linecap="round"/>
          <line x1="9"   y1="8.5" x2="8"   y2="4.5" stroke="white" stroke-width="1" stroke-linecap="round"/>
          <circle cx="14.5" cy="10" r="0.7" [attr.fill]="color"/>
        }

        <!-- 3. Eier – Ei -->
        @case ('eggs') {
          <path d="M12 5 Q 18 8 18 14 Q 18 20 12 20 Q 6 20 6 14 Q 6 8 12 5 Z" fill="white"/>
          <path d="M12 10 Q 15 10 15 14 Q 15 17 12 17 Q 9 17 9 14 Q 9 10 12 10 Z" [attr.fill]="color"/>
        }

        <!-- 4. Fisch -->
        @case ('fish') {
          <path d="M4 12 Q 8 7 14 7 Q 18 9 18 12 Q 18 15 14 17 Q 8 17 4 12 Z" fill="white"/>
          <path d="M4 12 L 1.5 8.5 L 1.5 15.5 Z" fill="white"/>
          <circle cx="15" cy="11" r="0.9" [attr.fill]="color"/>
        }

        <!-- 5. Erdnüsse – zwei verbundene Kerne -->
        @case ('peanuts') {
          <ellipse cx="10" cy="13" rx="3" ry="4" fill="white"/>
          <ellipse cx="14" cy="11" rx="3" ry="4" fill="white"/>
          <line x1="12" y1="10" x2="12" y2="15" [attr.stroke]="color" stroke-width="1"/>
          <path d="M10 9 Q 12 6 14 7" [attr.stroke]="color" stroke-width="1" fill="none" stroke-linecap="round"/>
        }

        <!-- 6. Soja – Schote mit Bohnen -->
        @case ('soy') {
          <path d="M5 17 Q 7 6 18 9 Q 17.5 18 7 18 Z" fill="white"/>
          <circle cx="9.5"  cy="13.5" r="1.3" [attr.fill]="color"/>
          <circle cx="12.5" cy="12.5" r="1.3" [attr.fill]="color"/>
          <circle cx="15.5" cy="11.5" r="1.3" [attr.fill]="color"/>
        }

        <!-- 7. Milch – Milchtropfen -->
        @case ('milk') {
          <path d="M9 5 L9 9 L6 15 Q6 20 12 20 Q18 20 18 15 L15 9 L15 5 Z" fill="white"/>
          <rect x="8" y="4" width="8" height="2" rx="1" fill="white"/>
          <path d="M9 11 Q 12 9.5 15 11" [attr.stroke]="color" stroke-width="0.8" fill="none"/>
        }

        <!-- 8. Nüsse – Nuss mit Schale -->
        @case ('nuts') {
          <line x1="12" y1="3" x2="12" y2="5" stroke="white" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M7 10 Q 12 5 17 10 L 16 12 L 8 12 Z" fill="white"/>
          <path d="M8 12 L 16 12 Q 15 19 12 19 Q 9 19 8 12 Z" fill="white"/>
          <line x1="9" y1="11" x2="15" y2="11" [attr.stroke]="color" stroke-width="0.8"/>
        }

        <!-- 9. Sellerie – Stange mit Blatt -->
        @case ('celery') {
          <line x1="12" y1="8" x2="12" y2="20" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M12 12 Q 8 9 7 5 Q 10 6 12 10" fill="white"/>
          <path d="M12 10 Q 16 7 17 4 Q 14 5 12 10" fill="white"/>
          <path d="M12 14 Q 8 12 7 9" stroke="white" stroke-width="1" fill="none" stroke-linecap="round"/>
        }

        <!-- 10. Senf – Senfflasche -->
        @case ('mustard') {
          <rect x="10.5" y="4" width="3" height="2" fill="white"/>
          <path d="M9.5 6.5 L14.5 6.5 L15.5 10 L15.5 19 Q12 20 8.5 19 L8.5 10 Z" fill="white"/>
          <rect x="10" y="12" width="4" height="3" rx="0.5" [attr.fill]="color"/>
        }

        <!-- 11. Sesam – fünf Samen -->
        @case ('sesame') {
          <ellipse cx="12" cy="8"  rx="2.2" ry="3.2" fill="white"/>
          <ellipse cx="8"  cy="13" rx="2.2" ry="3.2" fill="white" transform="rotate(-20 8 13)"/>
          <ellipse cx="16" cy="13" rx="2.2" ry="3.2" fill="white" transform="rotate(20 16 13)"/>
          <ellipse cx="9"  cy="19" rx="2"   ry="2.8" fill="white" transform="rotate(-10 9 19)"/>
          <ellipse cx="15" cy="19" rx="2"   ry="2.8" fill="white" transform="rotate(10 15 19)"/>
        }

        <!-- 12. Schwefeldioxid / Sulfite – Erlenmeyerkolben -->
        @case ('sulphites') {
          <rect x="10" y="4" width="4" height="1.6" fill="white"/>
          <path d="M10 5.5 L14 5.5 L14 11 L17.5 17.5 Q12 19.5 6.5 17.5 L10 11 Z" fill="white"/>
          <path d="M8 16 L16 16 L17 17.5 Q12 19.5 7 17.5 Z" [attr.fill]="color"/>
          <circle cx="10" cy="17" r="0.6" fill="white"/>
          <circle cx="13" cy="17.5" r="0.6" fill="white"/>
        }

        <!-- 13. Lupinen – Lupinenblüte -->
        @case ('lupin') {
          <ellipse cx="12" cy="7"  rx="2" ry="3" fill="white"/>
          <ellipse cx="7"  cy="11" rx="2" ry="3" fill="white" transform="rotate(-50 7 11)"/>
          <ellipse cx="17" cy="11" rx="2" ry="3" fill="white" transform="rotate(50 17 11)"/>
          <ellipse cx="8"  cy="17" rx="2" ry="3" fill="white" transform="rotate(-20 8 17)"/>
          <ellipse cx="16" cy="17" rx="2" ry="3" fill="white" transform="rotate(20 16 17)"/>
          <line x1="12" y1="10" x2="12" y2="20" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
        }

        <!-- 14. Weichtiere – Spiralmuschel -->
        @case ('molluscs') {
          <circle cx="12" cy="12" r="6.5" fill="white"/>
          <circle cx="12"   cy="12" r="5"   fill="none" [attr.stroke]="color" stroke-width="0.9"/>
          <circle cx="12.5" cy="12" r="3.4" fill="none" [attr.stroke]="color" stroke-width="0.9"/>
          <circle cx="13"   cy="12" r="1.8" fill="none" [attr.stroke]="color" stroke-width="0.9"/>
          <circle cx="13.4" cy="12" r="0.6" [attr.fill]="color"/>
        }

        <!-- Default: allgemeines Warnsymbol -->
        @default {
          <path d="M12 5.5 L19 18 L5 18 Z" fill="white"/>
          <rect x="11.3" y="9.5" width="1.4" height="5" rx="0.6" [attr.fill]="color"/>
          <circle cx="12" cy="16.3" r="0.8" [attr.fill]="color"/>
        }
      }
    </svg>
  `,
  styles: [`:host { display: inline-flex; align-items: center; justify-content: center; line-height: 0; }`],
})
export class AllergenIconComponent {
  @Input({ required: true }) key!: string;
  @Input() color = '#888888';
  @Input() size: number | string = 24;
}