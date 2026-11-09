import { Component, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NotizenStateService } from '../../services/notizen-state.service';
import { NotizenService, Notiz } from '../../services/notizen.service';

@Component({
  selector: 'app-notiz-float',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule],
  templateUrl: './notiz-float.component.html',
  styleUrl: './notiz-float.component.scss',
})
export class NotizFloatComponent {
  readonly state = inject(NotizenStateService);
  private readonly svc   = inject(NotizenService);
  private readonly router = inject(Router);

  @HostListener('document:keydown.escape')
  onEsc(): void { this.state.closePanel(); }

  colorClass(n: Notiz): string {
    return `nf-note--${n.color}`;
  }

  formatTime(t: string | null): string {
    return t ? `${t} Uhr` : 'Ganzer Tag';
  }

  markOne(id: string): void {
    this.svc.toggleDone(id).subscribe({ next: () => this.state.load() });
  }

  markAll(): void {
    const open = this.state.unreadToday();
    let done = 0;
    open.forEach(n => {
      this.svc.toggleDone(n.id).subscribe({ next: () => { if (++done === open.length) { this.state.load(); this.state.closePanel(); } } });
    });
    if (open.length === 0) this.state.closePanel();
  }

  goToNotizen(): void {
    this.state.closePanel();
    this.router.navigate(['/einstellungen/notizen']);
  }
}
