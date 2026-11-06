import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-backup',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './backup.component.html',
  styleUrl: './backup.component.scss'
})
export class BackupComponent {
  features = [
    { icon: 'cloud_upload',   label: 'Automatisches tägliches Backup' },
    { icon: 'download',       label: 'Reservierungen als CSV/Excel exportieren' },
    { icon: 'restore',        label: 'Wiederherstellung aus einem Backup-Punkt' },
    { icon: 'history',        label: 'Versions-Historie der Einstellungen' },
    { icon: 'drive_file_move', label: 'Upload in Google Drive / Dropbox' },
  ];
}
