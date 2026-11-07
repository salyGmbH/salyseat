import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../services/auth.service';
import { StaffService, StaffMember } from '../../../services/staff.service';

export type EmployeeRole = 'admin' | 'manager' | 'staff';
export type ModalMode    = 'add' | 'edit';

export interface RoleMeta {
  key: EmployeeRole;
  label: string;
  tagline: string;
  icon: string;
  permissions: string[];
}

export const ROLE_META: Record<EmployeeRole, RoleMeta> = {
  admin: {
    key: 'admin', label: 'Admin', tagline: 'Voller Zugriff', icon: 'shield',
    permissions: ['Alle Einstellungen bearbeiten', 'Mitarbeiter & Rollen verwalten', 'Finanzen, Exporte & Statistiken', 'Alles, was Manager darf'],
  },
  manager: {
    key: 'manager', label: 'Manager', tagline: 'Operativer Zugriff', icon: 'badge',
    permissions: ['Reservierungen verwalten', 'Tischplan & Räume ändern', 'Tagesberichte einsehen', 'Kein Zugriff auf Finanzen'],
  },
  staff: {
    key: 'staff', label: 'Staff', tagline: 'Eingeschränkt', icon: 'person',
    permissions: ['Reservierungen einsehen', 'Gäste einchecken', 'Keine Änderungen an Einstellungen'],
  },
};

/** Formularfelder für Hinzufügen UND Bearbeiten. */
interface StaffForm {
  name: string;
  email: string;
  role: EmployeeRole;
}

/**
 * Mitarbeiterverwaltung – Daten kommen aus dem Backend (/api/v1/admin/staff).
 * Die Mitarbeiter-Nummer (#01, #02 …) vergibt das Backend automatisch.
 * Ändern, Deaktivieren und Löschen dürfen nur Admins (prüft auch das Backend).
 */
@Component({
  selector: 'app-mitarbeiter',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './mitarbeiter.component.html',
  styleUrl: './mitarbeiter.component.scss',
})
export class MitarbeiterComponent implements OnInit {
  private readonly staffService = inject(StaffService);
  private readonly auth         = inject(AuthService);

  readonly roles: RoleMeta[] = [ROLE_META.admin, ROLE_META.manager, ROLE_META.staff];
  readonly roleMeta = ROLE_META;

  // ===================== STATE =====================
  readonly employees = signal<StaffMember[]>([]);
  readonly loading   = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly infoOpen  = signal(false);

  /** Nur Restaurant-Admins dürfen bearbeiten/löschen. */
  readonly canEdit = computed(() => {
    const roles = this.auth.user()?.roles ?? [];
    return roles.includes('ROLE_TENANT_ADMIN') || roles.includes('ROLE_SUPER_ADMIN');
  });

  // Modal (Hinzufügen + Bearbeiten)
  modalOpen = false;
  modalMode: ModalMode = 'add';
  editingId: string | null = null;
  form: StaffForm = this.emptyForm();
  formError = '';
  readonly saving    = signal(false);
  readonly saveError = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.staffService.list().subscribe({
      next: list => {
        this.employees.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Mitarbeiter konnten nicht geladen werden.');
      },
    });
  }

  toggleInfo(): void {
    this.infoOpen.update(v => !v);
  }

  // ===================== MODAL =====================
  openAddModal(): void {
    this.modalMode = 'add';
    this.editingId = null;
    this.form = this.emptyForm();
    this.resetErrors();
    this.modalOpen = true;
  }

  openEditModal(user: StaffMember): void {
    this.modalMode = 'edit';
    this.editingId = user.id;
    this.form = { name: user.name, email: user.email ?? '', role: user.role };
    this.resetErrors();
    this.modalOpen = true;
  }

  closeModal(): void {
    this.modalOpen = false;
    this.resetErrors();
  }

  setFormRole(role: EmployeeRole): void {
    this.form = { ...this.form, role };
  }

  saveModal(): void {
    const name  = this.form.name.trim();
    const email = this.form.email.trim();

    if (name.length < 2) {
      this.formError = 'Bitte einen Namen eintragen.';
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.formError = 'Bitte eine gültige E-Mail eintragen oder das Feld leer lassen.';
      return;
    }

    this.resetErrors();
    this.saving.set(true);

    const request$ = this.modalMode === 'add'
      ? this.staffService.create({ name, email: email || undefined, role: this.form.role })
      : this.staffService.update(this.editingId!, { name, email: email || null, role: this.form.role });

    request$.subscribe({
      next: saved => {
        if (this.modalMode === 'add') {
          this.employees.update(list => [...list, saved]);
        } else {
          this.replace(saved);
        }
        this.saving.set(false);
        this.closeModal();
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.error ?? 'Fehler beim Speichern.');
      },
    });
  }

  // ===================== ACTIONS =====================
  toggleActive(user: StaffMember): void {
    this.staffService.update(user.id, { active: !user.active }).subscribe({
      next: updated => this.replace(updated),
      error: () => this.load(), // Schalter wieder auf echten Stand bringen
    });
  }

  removeUser(user: StaffMember): void {
    if (!confirm(`${user.name} wirklich entfernen?`)) return;
    this.staffService.delete(user.id).subscribe({
      next: () => this.employees.update(list => list.filter(u => u.id !== user.id)),
    });
  }

  // ===================== HELPERS =====================
  /** 1 → "#01" */
  formatNumber(n: number): string {
    return '#' + String(n).padStart(2, '0');
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length)      return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  private replace(updated: StaffMember): void {
    this.employees.update(list => list.map(u => (u.id === updated.id ? updated : u)));
  }

  private resetErrors(): void {
    this.formError = '';
    this.saveError.set(null);
  }

  private emptyForm(): StaffForm {
    return { name: '', email: '', role: 'staff' };
  }
}
