import { Injectable, computed, signal } from '@angular/core';
import { EmployeeRole } from '../pages/einstellungen/mitarbeiter/mitarbeiter.component';

/**
 * Kategorie + einzelne Berechtigungs-Keys.
 * Der Key ist gleichzeitig der stabile Identifier fürs Backend/LocalStorage.
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
  { key: 'reservierungen.lesen',      category: 'Reservierungen', categoryIcon: 'event_available',
    label: 'Lesen',      description: 'Reservierungen einsehen' },
  { key: 'reservierungen.bearbeiten', category: 'Reservierungen', categoryIcon: 'event_available',
    label: 'Bearbeiten', description: 'Zeiten, Gäste, Notizen ändern' },
  { key: 'reservierungen.loeschen',   category: 'Reservierungen', categoryIcon: 'event_available',
    label: 'Löschen',    description: 'Reservierungen endgültig entfernen' },

  // Dokumente
  { key: 'dokumente.hochladen',       category: 'Dokumente',      categoryIcon: 'description',
    label: 'Hochladen',  description: 'Neue Dokumente anlegen' },
  { key: 'dokumente.loeschen',        category: 'Dokumente',      categoryIcon: 'description',
    label: 'Löschen',    description: 'Dokumente entfernen' },

  // Packages
  { key: 'packages.bearbeiten',       category: 'Packages',       categoryIcon: 'inventory_2',
    label: 'Bearbeiten', description: 'Pakete & Preise anpassen' },
];

export type RolePermissionMap = Record<EmployeeRole, Record<string, boolean>>;

const STORAGE_KEY = 'salyseat.permissions.v1';

/**
 * Default-Matrix:
 *  • Admin   → alles
 *  • Manager → alles Operative, kein hartes Löschen
 *  • Staff   → Lese-Zugriff, kein Editieren
 */
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
 *  - Admin hat IMMER alle Rechte (hart erzwungen im `can()`).
 *  - Änderungen für Manager/Staff sind persistiert in localStorage.
 *  - UI liest/schreibt ausschließlich über diesen Service.
 */
@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly _matrix = signal<RolePermissionMap>(this.readStored());

  readonly matrix   = computed(() => this._matrix());
  readonly catalog  = PERMISSION_CATALOG;

  /** Gruppen-Ansicht für die UI (Rechte-Seite). */
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
      [role]: { ...m[role], [permissionKey]: !m[role]?.[permissionKey] }
    }));
  }

  /** Alle Änderungen speichern (auch persistieren). */
  save(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._matrix())); }
    catch { /* ignore */ }
  }

  /** Reset auf Defaults. */
  resetToDefaults(): void {
    this._matrix.set(structuredClone(DEFAULT_MATRIX));
  }

  // ── Intern ──────────────────────────────────────────────────────────
  private readStored(): RolePermissionMap {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_MATRIX);
      const parsed = JSON.parse(raw) as RolePermissionMap;
      // Stellen sicher, dass alle Keys da sind
      const merged = structuredClone(DEFAULT_MATRIX);
      for (const role of Object.keys(merged) as EmployeeRole[]) {
        merged[role] = { ...merged[role], ...(parsed[role] ?? {}) };
      }
      return merged;
    } catch {
      return structuredClone(DEFAULT_MATRIX);
    }
  }
}
