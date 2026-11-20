import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

import { PermissionsService } from '../../../services/permissions.service';
import { TenantSettingsService } from '../../../services/tenant-settings.service';
import { VerifiedStaff } from '../../../services/staff.service';
import { StaffIdPromptComponent } from '../../../shared/staff-id-prompt/staff-id-prompt.component';
import {
  ROLE_META,
  EmployeeRole,
  RoleMeta
} from '../mitarbeiter/mitarbeiter.component';

@Component({
  selector: 'app-rechte',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule, StaffIdPromptComponent],
  templateUrl: './rechte.component.html',
  styleUrl: './rechte.component.scss'
})
export class RechteComponent {
  private readonly permissions     = inject(PermissionsService);
  private readonly tenantSettings  = inject(TenantSettingsService);

  readonly categories = this.permissions.categories;

  readonly roles: RoleMeta[] = [ROLE_META.admin, ROLE_META.manager, ROLE_META.staff];

  /** Snapshot-Signal auf die Matrix, damit Template nach Toggle aktualisiert. */
  readonly matrix = this.permissions.matrix;

  /**
   * Freigeschaltet, sobald sich ein Mitarbeiter mit Rolle 'admin' per
   * Mitarbeiter-ID-Abfrage bestätigt hat (keine JWT-Rolle mehr relevant).
   */
  unlockedAs = signal<{ employeeNumber: number; name: string } | null>(null);
  readonly isAdmin = computed(() => this.unlockedAs() !== null);

  promptOpen = signal(false);

  saved = signal(false);
  infoOpen = signal(false);

  /** Schalter: Mitarbeiter-ID-Abfrage bei Reservierungs-Aktionen aktiv? */
  staffIdCheckEnabled = signal<boolean>(false);

  constructor() {
    this.tenantSettings.load().subscribe(s => {
      this.staffIdCheckEnabled.set(!!s.staffIdCheck?.enabled);
    });
  }

  toggleInfo(): void { this.infoOpen.update(v => !v); }

  requestUnlock(): void {
    if (this.isAdmin()) return;
    this.promptOpen.set(true);
  }

  onStaffConfirmed(staff: VerifiedStaff & { employeeNumber: number }): void {
    this.promptOpen.set(false);
    this.unlockedAs.set({ employeeNumber: staff.employeeNumber, name: staff.name });
  }

  onStaffCancelled(): void {
    this.promptOpen.set(false);
  }

  isChecked(role: EmployeeRole, permKey: string): boolean {
    if (role === 'admin') return true;
    return !!this.matrix()[role]?.[permKey];
  }

  onToggle(role: EmployeeRole, permKey: string): void {
    if (!this.isAdmin()) return;       // nur freigeschalteter Admin darf ändern
    if (role === 'admin')  return;     // Admin-Spalte readonly
    this.permissions.toggle(role, permKey);
  }

  reset(): void {
    if (!this.isAdmin()) return;
    this.permissions.resetToDefaults();
  }

  save(): void {
    const unlocked = this.unlockedAs();
    if (!unlocked) return;
    this.permissions.save(unlocked.employeeNumber);
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2000);
  }

  toggleStaffIdCheck(): void {
    const enabled = !this.staffIdCheckEnabled();
    const settings = { ...this.tenantSettings.snapshot, staffIdCheck: { enabled } };
    this.tenantSettings.save(settings).subscribe(() => {
      this.staffIdCheckEnabled.set(enabled);
    });
  }
}
