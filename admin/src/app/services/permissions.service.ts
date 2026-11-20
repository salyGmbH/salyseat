import { Injectable, computed, inject, signal } from '@angular/core';
import { TenantSettingsService } from './tenant-settings.service';
import { EmployeeRole } from '../pages/einstellungen/mitarbeiter/mitarbeiter.component';

/**
 * Kategorie + einzelne Berechtigungs-Keys.
 * Der Key ist gleichzeitig der stabile Identifier fürs Backend.
 */
export interface PermissionDef {
  key: string;          // z.B. 'reservierungen.bearbeiten'
  category: string;     // sichtbare Gruppe
  categoryIcon: string; // Material-Icon-Name
  label: string;        // sichtbares Label
  description?: string;
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  // Reservierungen
  { key: 'reservierungen.lesen',      category: 'rechte.cat_reservations', categoryIcon: 'event_available',
    label: 'rechte.perm_read',   description: 'rechte.perm_res_read_desc' },
  { key: 'reservierungen.bearbeiten', category: 'rechte.cat_reservations', categoryIcon: 'event_available',
    label: 'rechte.perm_edit',   description: 'rechte.perm_res_edit_desc' },
  { key: 'reservierungen.loeschen',   category: 'rechte.cat_reservations', categoryIcon: 'event_available',
    label: 'rechte.perm_delete', description: 'rechte.perm_res_delete_desc' },

  // Dokumente
  { key: 'dokumente.hochladen',       category: 'rechte.cat_documents', categoryIcon: 'description',
    label: 'rechte.perm_upload', description: 'rechte.perm_doc_upload_desc' },
  { key: 'dokumente.loeschen',        category: 'rechte.cat_documents', categoryIcon: 'description',
    label: 'rechte.perm_delete', description: 'rechte.perm_doc_delete_desc' },

  // Packages
  { key: 'packages.bearbeiten',       category: 'rechte.cat_packages', categoryIcon: 'inventory_2',
    label: 'rechte.perm_edit',   description: 'rechte.perm_pkg_edit_desc' },
];

export type RolePermissionMap = Record<EmployeeRole, Record<string, boolean>>;

const DEFAULT_MATRIX: RolePermissionMap = {
  admin: {
    'reservierungen.lesen':      true,
    'reservierungen.bearbeiten': true,
    'reservierungen.loeschen':   true,
    'dokumente.hochladen':       true,
    'dokumente.loeschen':        true,
    'packages.bearbeiten':       true,
  },
  manager: {
    'reservierungen.lesen':      true,
    'reservierungen.bearbeiten': true,
    'reservierungen.loeschen':   true,
    'dokumente.hochladen':       true,
    'dokumente.loeschen':        false,
    'packages.bearbeiten':       true,
  },
  staff: {
    'reservierungen.lesen':      true,
    'reservierungen.bearbeiten': false,
    'reservierungen.loeschen':   false,
    'dokumente.hochladen':       false,
    'dokumente.loeschen':        false,
    'packages.bearbeiten':       false,
  },
};

/**
 * Zentraler Store für die Rollen-Berechtigungs-Matrix.
 *  - Admin hat IMMER alle Rechte (hart erzwungen in can()).
 *  - Matrix wird in den Tenant-Settings (Backend) persistiert.
 *  - UI liest/schreibt ausschließlich über diesen Service.
 */
@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly tenantSettings = inject(TenantSettingsService);
  private readonly _matrix        = signal<RolePermissionMap>(structuredClone(DEFAULT_MATRIX));

  readonly matrix  = computed(() => this._matrix());
  readonly catalog = PERMISSION_CATALOG;

  /** Gruppen-Ansicht für die UI. */
  readonly categories = computed(() => {
    const map = new Map<string, { category: string; icon: string; perms: PermissionDef[] }>();
    for (const p of PERMISSION_CATALOG) {
      if (!map.has(p.category)) {
        map.set(p.category, { category: p.category, icon: p.categoryIcon, perms: [] });
      }
      map.get(p.category)!.perms.push(p);
    }
    return [...map.values()];
  });

  constructor() {
    // Berechtigungen beim ersten Laden aus den Tenant-Settings lesen
    this.tenantSettings.load().subscribe(settings => {
      if (settings.permissions) {
        const merged = structuredClone(DEFAULT_MATRIX);
        for (const role of Object.keys(merged) as EmployeeRole[]) {
          merged[role] = { ...merged[role], ...(settings.permissions![role] ?? {}) };
        }
        this._matrix.set(merged);
      }
    });
  }

  /** Prüft ob eine Rolle eine Berechtigung hat. Admin immer true. */
  can(role: EmployeeRole, permissionKey: string): boolean {
    if (role === 'admin') return true;
    return !!this._matrix()[role]?.[permissionKey];
  }

  /** Toggle im UI — Admin-Spalte ist readonly. */
  toggle(role: EmployeeRole, permissionKey: string): void {
    if (role === 'admin') return;
    this._matrix.update(m => ({
      ...m,
      [role]: { ...m[role], [permissionKey]: !m[role]?.[permissionKey] },
    }));
  }

  /**
   * Alle Änderungen ins Backend speichern. `actingEmployeeNumber` stammt aus der
   * Mitarbeiter-ID-Abfrage (Rolle 'admin' bereits im Frontend verifiziert) — das
   * Backend prüft diese Nummer serverseitig erneut, bevor die Änderung greift.
   */
  save(actingEmployeeNumber: number): void {
    const settings = {
      ...this.tenantSettings.snapshot,
      permissions: this._matrix(),
      actingEmployeeNumber,
    };
    this.tenantSettings.save(settings).subscribe({
      error: () => console.warn('Berechtigungen-Sync fehlgeschlagen'),
    });
  }

  /** Reset auf Defaults. */
  resetToDefaults(): void {
    this._matrix.set(structuredClone(DEFAULT_MATRIX));
  }
}
