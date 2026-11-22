import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  mobileOpen = signal(false);

  openMobile() { this.mobileOpen.set(true); }
  closeMobile() { this.mobileOpen.set(false); }
  toggleMobile() { this.mobileOpen.update(v => !v); }

  // ─── Reservierungs-Panel-Toggle (raum-detail) ───────────────────────────
  // Der Toggle-Button lebt fest in der Sidebar-Fußzeile (immer an gleicher
  // Stelle sichtbar), soll aber nur erscheinen, während die raum-detail-Seite
  // aktiv ist. Daher hier zentral im LayoutService statt lokal in der
  // Komponente, damit Sidebar und raum-detail denselben State teilen.
  resPanelCollapsed = signal(false);
  resPanelToggleVisible = signal(false);

  toggleResPanel() { this.resPanelCollapsed.update(v => !v); }
}
