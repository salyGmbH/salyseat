import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

export type EmployeeRole = 'admin' | 'manager' | 'staff';

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: EmployeeRole;
  active: boolean;
}

export interface RoleMeta {
  key: EmployeeRole;
  label: string;
  tagline: string;
  icon: string;
  permissions: string[];
}

/**
 * Rollen-Metadaten — Label, Icon, Kurzbeschreibung und konkrete Rechte
 * werden aus dieser Single-Source gelesen. Im SCSS gibt es für jeden
 * Key (admin / manager / staff) passende Farbvarianten.
 */
export const ROLE_META: Record<EmployeeRole, RoleMeta> = {
  admin: {
    key: 'admin',
    label: 'Admin',
    tagline: 'Voller Zugriff',
    icon: 'shield',
    permissions: [
      'Alle Einstellungen bearbeiten',
      'Mitarbeiter & Rollen verwalten',
      'Finanzen, Exporte & Statistiken',
      'Alles, was Manager darf'
    ]
  },
  manager: {
    key: 'manager',
    label: 'Manager',
    tagline: 'Operativer Zugriff',
    icon: 'badge',
    permissions: [
      'Reservierungen verwalten',
      'Tischplan & Räume ändern',
      'Tagesberichte einsehen',
      'Kein Zugriff auf Finanzen'
    ]
  },
  staff: {
    key: 'staff',
    label: 'Staff',
    tagline: 'Eingeschränkt',
    icon: 'person',
    permissions: [
      'Reservierungen einsehen',
      'Gäste einchecken',
      'Keine Änderungen an Einstellungen'
    ]
  }
};

@Component({
  selector: 'app-mitarbeiter',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './mitarbeiter.component.html',
  styleUrl: './mitarbeiter.component.scss'
})
export class MitarbeiterComponent {

  // ===================== CONFIG =====================
  readonly roles: RoleMeta[] = [ROLE_META.admin, ROLE_META.manager, ROLE_META.staff];
  readonly roleMeta = ROLE_META;

  // ===================== STATE =====================
  modalOpen = false;
  saved     = false;
  infoOpen  = false;

  employees: Employee[] = [
    { id: '1', name: 'Max Mustermann',  email: 'max@example.com',   role: 'admin',   active: true },
    { id: '2', name: 'Lena Vogel',      email: 'lena@example.com',  role: 'manager', active: true },
    { id: '3', name: 'Anna Schmidt',    email: 'anna@example.com',  role: 'staff',   active: true }
  ];

  newUser: Employee = this.emptyUser();

  // ===================== INFO =====================
  toggleInfo(): void { this.infoOpen = !this.infoOpen; }

  // ===================== MODAL =====================
  openModal(): void {
    this.newUser = this.emptyUser();
    this.modalOpen = true;
  }

  closeModal(): void { this.modalOpen = false; }

  // ===================== ACTIONS =====================
  addUser(): void {
    if (!this.newUser.name.trim() || !this.newUser.email.trim()) return;
    this.employees = [
      ...this.employees,
      { ...this.newUser, id: String(Date.now()) }
    ];
    this.closeModal();
  }

  removeUser(user: Employee): void {
    this.employees = this.employees.filter(u => u.id !== user.id);
  }

  setRole(user: Employee, role: EmployeeRole): void {
    this.employees = this.employees.map(
      u => u.id === user.id ? { ...u, role } : u
    );
  }

  setNewRole(role: EmployeeRole): void {
    this.newUser = { ...this.newUser, role };
  }

  toggleActive(user: Employee): void {
    this.employees = this.employees.map(
      u => u.id === user.id ? { ...u, active: !u.active } : u
    );
  }

  // ===================== SAVE =====================
  save(): void {
    this.saved = true;
    setTimeout(() => this.saved = false, 2000);
  }

  // ===================== HELPERS =====================
  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length)       return '?';
    if (parts.length === 1)  return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  trackById(_: number, u: Employee): string { return u.id; }
  trackByKey(_: number, r: RoleMeta): EmployeeRole { return r.key; }

  private emptyUser(): Employee {
    return { id: '', name: '', email: '', role: 'staff', active: true };
  }
}
