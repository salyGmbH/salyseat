import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-branding',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './branding.component.html',
  styleUrl: './branding.component.scss'
})
export class BrandingComponent {
  features = [
    { icon: 'palette',       label: 'Eigene Akzentfarbe fürs Widget' },
    { icon: 'image',         label: 'Logo hochladen (hell + dunkel)' },
    { icon: 'font_download', label: 'Schriftart anpassen' },
    { icon: 'mark_email_read', label: 'E-Mail-Templates mit Logo & Farben' },
    { icon: 'draft',         label: 'Rechnungs-Design individualisieren' },
  ];
}
