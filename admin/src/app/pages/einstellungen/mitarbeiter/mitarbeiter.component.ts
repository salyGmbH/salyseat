import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../services/auth.service';
import {
  StaffService,
  StaffMember,
  CreateStaffDto,
} from '../../../services/staff.service';

export type EmployeeRole = 'admin' | 'manager' | 'staff';
export type ModalMode    = 'add' | 'edit';

export interface Employee {
  /** Interner UUID/Timestamp — niemals dem User gezeigt. */
  id: string;
  /**
   * Mitarbeiter-ID — menschenlesbarer Bezeichner (z.B. "001").
   * Wird später in Audit-Logs hinterlegt: "Reservierung X
   */
  staffId: string;
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

/**
 * Mitarbeiter-Verwaltung.
 *
 * Datenfluss:
 *   • Beim Init wird die Liste vom StaffService gelesen (HTTP).
 *   • Falls das Backend (noch) nichts liefert oder der Aufruf fehlschlägt,
 *     wird mit einer kleinen lokalen Demo-Liste weitergearbeitet, damit
 *     die UI nicht leer wirkt.
 *   • CRUD-Operationen versuchen erst Backend-Sync, fallen dann lokal zurück.
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

  /** Liste aller Mitarbeiter — Signal, damit die UI sie reaktiv rendert. */
  readonly employees = signal<Employee[]>([
    { id: '1', staffId: '001', name: 'Max Mustermann', email: 'max@example.com',  role: 'admin',   active: true },
    { id: '2', staffId: '002', name: 'Lena Vogel',     email: 'lena@example.com', role: 'manager', active: true },
    { id: '3', staffId: '003', name: 'Anna Schmidt',   email: 'anna@example.com', role: 'staff',   active: true },
  ]);

  /** True, solange wir auf die initiale Liste vom Backend warten. */
  readonly loading = signal<boolean>(false);

  /** Info-Box ein/aus. */
  readonly infoOpen = signal<boolean>(false);
  toggleInfo(): void { this.infoOpen.update(v => !v); }

  /**
   * Darf der aktuelle Nutzer Mitarbeiter bearbeiten?
   * Aktuell: alles, was nicht eingeloggt ist, darf nichts; Admins dürfen alles.
   * Später kann hier feiner unterschieden werden.
   */
  readonly canEdit  = computed(() => {
    const user = this.auth.user();
    if (!user) return false;
    return (user.roles ?? []).includes('ROLE_SUPER_ADMIN');
  });

  readonly canSeeId = computed(() => {
    const user = this.auth.user();
    if (!user) return false;
    return (user.roles ?? []).includes('ROLE_SUPER_ADMIN');
  });

  // Modal-State (Add/Edit-Modal mit Rollenpicker)
  modalOpen = false;
  modalMode: ModalMode = 'add';
  editingId: string | null = null;
  formUser: Employee = this.emptyUser();
  formError = '';

  /** Fehler vom Backend-Speichern, im Modal-Footer angezeigt. */
  readonly saveError = signal<string | null>(null);

  // Zweites, einfacheres Bearbeiten-Modal (nur Name + E-Mail)
  readonly editModal   = signal<boolean>(false);
  readonly editTarget  = signal<Employee | null>(null);
  readonly editName    = signal<string>('');
  readonly editEmail   = signal<string>('');
  readonly editError   = signal<string | null>(null);
  readonly editSaving  = signal<boolean>(false);

  newUser: CreateStaffDto = this.emptyDto();

  // ===================== INIT =====================
  ngOnInit(): void {
    this.loading.set(true);
    this.staffService.list().subscribe({
      next: list => {
        if (list && list.length > 0) {
          this.employees.set(list.map(m => this.toEmployee(m)));
        }
        this.loading.set(false);
      },
      error: () => {
        // Backend nicht verfügbar — wir behalten die Demo-Liste.
        this.loading.set(false);
      },
    });
  }

  // ===================== ADD/EDIT-MODAL =====================
  openAddModal(): void {
    this.modalMode = 'add';
    this.editingId = null;
    this.formUser  = this.emptyUser();
    this.formUser.staffId = this.suggestStaffId();
    this.formError = '';
    this.saveError.set(null);
    this.modalOpen = true;
  }

  openEditModal(user: Employee): void {
    this.modalMode = 'edit';
    this.editingId = user.id;
    // Tiefen-Kopie, damit Abbrechen die Originalliste nicht verändert
    this.formUser  = { ...user };
    this.formError = '';
    this.saveError.set(null);
    this.modalOpen = true;
  }

  closeModal(): void {
    this.modalOpen = false;
    this.formError = '';
    this.saveError.set(null);
  }

  /**
   * Schlägt die nächste freie Mitarbeiter-ID im Schema "###" vor.
   * Zählt die größte vorhandene Nummer und addiert 1.
   * Wenn noch keine numerische ID existiert, beginnt es bei 001.
   */
  suggestStaffId(): string {
    const numbers = this.employees()
      .map(e => e.staffId)
      .filter(id => /^\d+$/.test(id))
      .map(id => parseInt(id, 10));
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
    return String(next).padStart(3, '0');
  }

  // ===================== ACTIONS =====================
  saveModal(): void {
    const name    = this.formUser.name.trim();
    const email   = this.formUser.email.trim();
    const staffId = this.formUser.staffId.trim();

    if (!name)    { this.formError = 'Bitte einen Namen eintragen.';            return; }
    if (!email)   { this.formError = 'Bitte eine E-Mail eintragen.';            return; }
    if (!staffId) { this.formError = 'Mitarbeiter-ID darf nicht leer sein.';    return; }

    // Eindeutigkeitsprüfung — gleiche staffId nicht doppelt vergeben
    const duplicate = this.employees().some(
      e => e.staffId.toLowerCase() === staffId.toLowerCase()
        && e.id !== this.editingId
    );
    if (duplicate) {
      this.formError = `Mitarbeiter-ID "${staffId}" ist bereits vergeben.`;
      return;
    }

    if (this.modalMode === 'add') {
      this.employees.update(list => [
        ...list,
        { ...this.formUser, id: String(Date.now()), name, email, staffId }
      ]);
    } else if (this.editingId) {
      const id = this.editingId;
      this.employees.update(list => list.map(u =>
        u.id === id
          ? { ...this.formUser, id: u.id, name, email, staffId }
          : u
      ));
    }

    this.closeModal();
  }

  // ── Bearbeiten-Modal (nur Name + E-Mail) ──────────────────────────────
  openEdit(user: Employee): void {
    this.editTarget.set(user);
    this.editName.set(user.name);
    this.editEmail.set(user.email ?? '');
    this.editError.set(null);
    this.editModal.set(true);
  }

  closeEdit(): void { this.editModal.set(false); }

  saveEdit(): void {
    const target = this.editTarget();
    if (!target || !this.editName().trim()) return;
    this.editSaving.set(true);
    this.editError.set(null);

    const newName  = this.editName().trim();
    const newEmail = this.editEmail().trim();

    this.staffService.update(target.id, {
      name:  newName,
      email: newEmail || null,
    }).subscribe({
      next: updated => {
        this.replace(this.toEmployee(updated));
        this.editSaving.set(false);
        this.closeEdit();
      },
      error: (err) => {
        // Backend nicht verfügbar → lokales Update als Fallback,
        // damit der Demo-Modus trotzdem funktioniert.
        if (err?.status === 0 || err?.status === 404) {
          this.replace({ ...target, name: newName, email: newEmail });
          this.editSaving.set(false);
          this.closeEdit();
          return;
        }
        this.editSaving.set(false);
        this.editError.set(err?.error?.error ?? 'Fehler beim Speichern.');
      },
    });
  }

  setFormRole(role: EmployeeRole): void {
    this.formUser = { ...this.formUser, role };
  }

  // ── Aktiv/Inaktiv ──────────────────────────────────────────────────────
  toggleActive(user: Employee): void {
    const target = { ...user, active: !user.active };
    // Optimistisches Update — falls Backend antwortet, mergen wir das
    // Ergebnis darüber. Falls nicht, bleibt unser optimistischer Stand.
    this.replace(target);
    this.staffService.update(user.id, { active: target.active }).subscribe({
      next:  updated => this.replace(this.toEmployee(updated)),
      error: () => { /* lokaler Stand bleibt */ },
    });
  }

  // ── Löschen ────────────────────────────────────────────────────────────
  removeUser(user: Employee): void {
    // Optimistisches Entfernen — bei Backend-Fehler ggf. revert (hier
    // bewusst nicht implementiert, weil der Demo-Modus auch ohne Backend
    // klappen muss).
    this.employees.update(list => list.filter(u => u.id !== user.id));
    this.staffService.delete(user.id).subscribe({
      error: () => { /* lokaler Stand bleibt */ },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  formatNumber(n: number): string {
    return '#' + String(n).padStart(2, '0');
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length)      return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  trackById(_: number, u: Employee): string  { return u.id; }
  trackByKey(_: number, r: RoleMeta): EmployeeRole { return r.key; }

  /**
   * Ersetzt einen einzelnen Eintrag in der Liste — wird sowohl von
   * Backend-Antworten als auch lokalen Änderungen genutzt.
   */
  private replace(updated: Employee): void {
    this.employees.update(list =>
      list.some(u => u.id === updated.id)
        ? list.map(u => u.id === updated.id ? updated : u)
        : [...list, updated]
    );
  }

  /** Wandelt ein Backend-StaffMember in unser internes Employee-Modell. */
  private toEmployee(m: StaffMember): Employee {
    return {
      id:      m.id,
      staffId: String(m.employee_number ?? '').padStart(3, '0'),
      name:    m.name,
      email:   m.email ?? '',
      role:    m.role,
      active:  m.active,
    };
  }

  private emptyUser(): Employee {
    return { id: '', staffId: '', name: '', email: '', role: 'staff', active: true };
  }

  private emptyDto(): CreateStaffDto {
    return { name: '', email: '', role: 'staff' };
  }
}
