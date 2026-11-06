import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import { PermissionsService } from '../../../services/permissions.service';
import { CurrentUserService } from '../../../services/current-user.service';
import {
  ROLE_META,
  EmployeeRole,
  RoleMeta
} from '../mitarbeiter/mitarbeiter.component';

@Component({
  selector: 'app-rechte',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './rechte.component.html',
  styleUrl: './rechte.component.scss'
})
export class RechteComponent {
  private readonly permissions = inject(PermissionsService);
  private readonly currentUser = inject(CurrentUserService);

  readonly isAdmin    = this.currentUser.isAdmin;
  readonly categories = this.permissions.categories;

  readonly roles: RoleMeta[] = [ROLE_META.admin, ROLE_META.manager, ROLE_META.staff];

  /** Snapshot-Signal auf die Matrix, damit Template nach Toggle aktualisiert. */
  readonly matrix = this.permissions.matrix;

  saved = signal(false);
  infoOpen = signal(false);

  toggleInfo(): void { this.infoOpen.update(v => !v); }

  isChecked(role: EmployeeRole, permKey: string): boolean {
    if (role === 'admin') return true;
    return !!this.matrix()[role]?.[permKey];
  }

  onToggle(role: EmployeeRole, permKey: string): void {
    if (!this.isAdmin()) return;       // nur Admin darf ändern
    if (role === 'admin')  return;     // Admin-Spalte readonly
    this.permissions.toggle(role, permKey);
  }

  reset(): void {
    if (!this.isAdmin()) return;
    this.permissions.resetToDefaults();
  }

  save(): void {
    if (!this.isAdmin()) return;
    this.permissions.save();
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2000);
  }
}
