import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { GuestsService, Guest, UpdateGuestDto } from '../../../services/guests.service';
import { TenantSettingsService, ConfigItem } from '../../../services/tenant-settings.service';

@Component({
  selector: 'app-kunden',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './kunden.component.html',
  styleUrl: './kunden.component.scss'
})
export class KundenComponent implements OnInit {
  private readonly guestsService   = inject(GuestsService);
  private readonly tenantSettings  = inject(TenantSettingsService);

  features = [
    { icon: 'people',         label: 'Gäste-Datenbank mit Historie' },
    { icon: 'star',           label: 'Stammgäste markieren & favorisieren' },
    { icon: 'label',          label: 'Tags (Allergien, Vorlieben, VIP)' },
    { icon: 'warning',        label: 'Blacklist für No-Shows' },
    { icon: 'cake',           label: 'Geburtstags-Erinnerungen' },
    { icon: 'trending_up',    label: 'Umsatz & Besuchsfrequenz pro Gast' },
  ];

  guests      = signal<Guest[]>([]);
  total       = signal(0);
  loading     = signal(false);
  search      = signal('');
  searchInput = '';

  // Verfügbare Typen/Hinweise aus den Tenant-Settings
  availableGasttypen = signal<ConfigItem[]>([]);
  availableHinweise  = signal<ConfigItem[]>([]);

  // Edit-Modal
  editModal   = signal(false);
  editTarget  = signal<Guest | null>(null);
  editName    = signal('');
  editPhone   = signal('');
  editNotes   = signal('');
  editBlocked = signal(false);
  editReason  = signal('');
  editGasttypen = signal<string[]>([]);
  editHinweise  = signal<string[]>([]);
  editSaving  = signal(false);
  editError   = signal<string | null>(null);

  ngOnInit(): void {
    this.tenantSettings.load().subscribe(s => {
      if (s.gasttypen?.length)  this.availableGasttypen.set(s.gasttypen);
      if (s.hinweise?.length)   this.availableHinweise.set(s.hinweise);
    });
    this.loadGuests();
  }

  loadGuests(): void {
    this.loading.set(true);
    this.guestsService.load({ search: this.search() || undefined }).subscribe(res => {
      this.guests.set(res.guests);
      this.total.set(res.total);
      this.loading.set(false);
    });
  }

  onSearch(): void {
    this.search.set(this.searchInput.trim());
    this.loadGuests();
  }

  clearSearch(): void {
    this.searchInput = '';
    this.search.set('');
    this.loadGuests();
  }

  // ── Edit-Modal ─────────────────────────────────────────────────────────
  openEdit(guest: Guest): void {
    this.editTarget.set(guest);
    this.editName.set(guest.name);
    this.editPhone.set(guest.phone ?? '');
    this.editNotes.set(guest.internal_notes ?? '');
    this.editBlocked.set(guest.blocked);
    this.editReason.set(guest.blocked_reason ?? '');
    this.editGasttypen.set([...(guest.gasttypen ?? [])]);
    this.editHinweise.set([...(guest.hinweise ?? [])]);
    this.editError.set(null);
    this.editModal.set(true);
  }

  closeEdit(): void { this.editModal.set(false); }

  toggleGasttyp(key: string): void {
    this.editGasttypen.update(list =>
      list.includes(key) ? list.filter(k => k !== key) : [...list, key]
    );
  }

  toggleHinweis(key: string): void {
    this.editHinweise.update(list =>
      list.includes(key) ? list.filter(k => k !== key) : [...list, key]
    );
  }

  saveEdit(): void {
    const target = this.editTarget();
    if (!target || !this.editName().trim()) return;

    this.editSaving.set(true);
    this.editError.set(null);

    const dto: UpdateGuestDto = {
      name:           this.editName().trim(),
      phone:          this.editPhone().trim() || null,
      internal_notes: this.editNotes().trim() || null,
      blocked:        this.editBlocked(),
      blocked_reason: this.editBlocked() ? this.editReason().trim() : '',
      gasttypen:      this.editGasttypen(),
      hinweise:       this.editHinweise(),
    };

    this.guestsService.update(target.id, dto).subscribe({
      next: updated => {
        this.guests.update(list => list.map(g => g.id === updated.id ? updated : g));
        this.editSaving.set(false);
        this.closeEdit();
      },
      error: err => {
        this.editSaving.set(false);
        this.editError.set(err?.error?.error ?? 'Fehler beim Speichern.');
      },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  getGasttypenLabels(keys: string[]): ConfigItem[] {
    return this.availableGasttypen().filter(g => keys.includes(g.key));
  }

  getHinweiseLabels(keys: string[]): ConfigItem[] {
    return this.availableHinweise().filter(h => keys.includes(h.key));
  }

  reliabilityClass(score: number): string {
    if (score >= 90) return 'score--green';
    if (score >= 70) return 'score--yellow';
    return 'score--red';
  }

  initials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }
}
