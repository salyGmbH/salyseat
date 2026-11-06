import { Injectable, computed, signal } from '@angular/core';
import { EmployeeRole } from '../pages/einstellungen/mitarbeiter/mitarbeiter.component';

/**
 * Sehr schlanker Mock-Service für den aktuell eingeloggten User.
 * Später wird das durch einen echten AuthService ersetzt — für die
 * Berechtigungs-UI brauchen wir erstmal nur ein Signal, das sagt
 * welche Rolle der eingeloggte User hat.
 *
 * Default: `admin`, damit die Rechte-Seite editierbar ist.
 */
@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  private readonly _role = signal<EmployeeRole>('admin');

  readonly role    = computed(() => this._role());
  readonly isAdmin = computed(() => this._role() === 'admin');

  setRole(role: EmployeeRole): void {
    this._role.set(role);
  }
}
