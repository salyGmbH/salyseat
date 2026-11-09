import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';

@Component({
  selector: 'app-einstellungen',
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterLink, PageHeaderComponent, RouterOutlet, TranslateModule],
  templateUrl: './einstellungen.component.html',
  styleUrl: './einstellungen.component.scss'
})
export class EinstellungenComponent {
  // Die sichtbare Liste lebt in der Overview-Komponente;
  // diese Wrapper-Komponente rendert nur Header + <router-outlet>.
}
