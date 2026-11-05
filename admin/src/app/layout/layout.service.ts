import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  mobileOpen = signal(false);

  openMobile() { this.mobileOpen.set(true); }
  closeMobile() { this.mobileOpen.set(false); }
  toggleMobile() { this.mobileOpen.update(v => !v); }
}
