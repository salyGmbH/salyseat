import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { GuestsService, Guest, GuestReservation, UpdateGuestDto } from '../../../services/guests.service';
import { TenantSettingsService, ConfigItem } from '../../../services/tenant-settings.service';

type ModalTab  = 'profil' | 'hinweise' | 'reservierungen';
type FilterKey = 'alle' | 'vip' | 'stammgast' | 'neukunde' | 'gesperrt' | 'noshows' | 'geburtstag' | 'jahrestag';

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

  guests      = signal<Guest[]>([]);
  total       = signal(0);
  loading     = signal(false);
  search      = signal('');
  searchInput = '';

  availableGasttypen = signal<ConfigItem[]>([]);
  availableHinweise  = signal<ConfigItem[]>([]);
  availableAllergene = signal<ConfigItem[]>([]);

  // ── Aktiver Filter ─────────────────────────────────────────────────────────
  activeFilter = signal<FilterKey>('alle');

  filteredGuests = computed(() => {
    const list = this.guests();
    switch (this.activeFilter()) {
      case 'vip':        return list.filter(g => this.isVip(g));
      case 'stammgast':  return list.filter(g => this.isRegular(g));
      case 'neukunde':   return list.filter(g => !this.isVip(g) && !this.isRegular(g) && !g.blocked);
      case 'gesperrt':   return list.filter(g => g.blocked);
      case 'noshows':    return list.filter(g => g.no_show_count > 0);
      case 'geburtstag': return list.filter(g => g.birthday?.slice(5) === this.todayMmDd);
      case 'jahrestag':  return list.filter(g => g.wedding_date?.slice(5) === this.todayMmDd);
      default:           return list;
    }
  });

  filterCounts = computed(() => {
    const list = this.guests();
    return {
      alle:       list.length,
      vip:        list.filter(g => this.isVip(g)).length,
      stammgast:  list.filter(g => this.isRegular(g)).length,
      neukunde:   list.filter(g => !this.isVip(g) && !this.isRegular(g) && !g.blocked).length,
      gesperrt:   list.filter(g => g.blocked).length,
      noshows:    list.filter(g => g.no_show_count > 0).length,
      geburtstag: list.filter(g => g.birthday?.slice(5) === this.todayMmDd).length,
      jahrestag:  list.filter(g => g.wedding_date?.slice(5) === this.todayMmDd).length,
    };
  });

  // ── VIP-Schwelle (aus Tenant-Settings, konfigurierbar unter Einstellungen → Reservierungen) ──
  vipThreshold = signal(5);

  // ── Geburtstags- & Hochzeitstags-Alert ────────────────────────────────────
  private readonly todayMmDd = (() => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  birthdayGuests = computed(() =>
    this.guests().filter(g => g.birthday?.slice(5) === this.todayMmDd)
  );

  weddingGuests = computed(() =>
    this.guests().filter(g => g.wedding_date?.slice(5) === this.todayMmDd)
  );

  // ── Edit-Modal ─────────────────────────────────────────────────────────────
  editModal   = signal(false);
  editTarget  = signal<Guest | null>(null);
  activeTab   = signal<ModalTab>('profil');

  // Profil-Felder
  editName    = signal('');
  editPhone   = signal('');
  editNotes   = signal('');
  editAllergies = signal('');
  editBlocked = signal(false);
  editReason  = signal('');
  editBirthday     = signal('');
  editWeddingDate  = signal('');

  // Tags
  editGasttypen = signal<string[]>([]);
  editHinweise  = signal<string[]>([]);
  editAllergene = signal<string[]>([]);

  // Reservierungen
  reservationsUpcomingOnly = signal(false);
  reservations             = signal<GuestReservation[]>([]);
  reservationsLoading      = signal(false);
  avgPartySize             = signal<number>(0);

  editSaving  = signal(false);
  editError   = signal<string | null>(null);

  // Computed: Reservierungen gefiltert
  filteredReservations = computed(() => {
    const list = this.reservations();
    if (this.reservationsUpcomingOnly()) {
      const now = new Date().toISOString().slice(0, 16);
      return list.filter(r => r.starts_at >= now);
    }
    return list;
  });

  ngOnInit(): void {
    this.tenantSettings.load().subscribe(s => {
      if (s.gasttypen?.length)  this.availableGasttypen.set(s.gasttypen);
      if (s.hinweise?.length)   this.availableHinweise.set(s.hinweise);
      if (s.allergene?.length)  this.availableAllergene.set(s.allergene);
      if (s.vipThreshold)       this.vipThreshold.set(s.vipThreshold);
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

  // ── Modal ──────────────────────────────────────────────────────────────────

  openEdit(guest: Guest): void {
    this.editTarget.set(guest);
    this.editName.set(guest.name);
    this.editPhone.set(guest.phone ?? '');
    this.editNotes.set(guest.internal_notes ?? '');
    this.editAllergies.set(guest.allergies ?? '');
    this.editBlocked.set(guest.blocked);
    this.editReason.set(guest.blocked_reason ?? '');
    this.editBirthday.set(guest.birthday ?? '');
    this.editWeddingDate.set(guest.wedding_date ?? '');
    this.editGasttypen.set([...(guest.gasttypen ?? [])]);
    this.editHinweise.set([...(guest.hinweise ?? [])]);
    this.editAllergene.set([...(guest.allergene ?? [])]);
    this.editError.set(null);
    this.activeTab.set('profil');
    this.reservations.set([]);
    this.avgPartySize.set(0);
    this.reservationsUpcomingOnly.set(false);
    this.editModal.set(true);
  }

  closeEdit(): void { this.editModal.set(false); }

  setTab(tab: ModalTab): void {
    this.activeTab.set(tab);
    if (tab === 'reservierungen' && this.reservations().length === 0 && !this.reservationsLoading()) {
      this.loadGuestReservations();
    }
  }

  loadGuestReservations(): void {
    const guest = this.editTarget();
    if (!guest) return;
    this.reservationsLoading.set(true);
    this.guestsService.loadReservations(guest.id).subscribe(res => {
      this.reservations.set(res.reservations);
      this.avgPartySize.set(res.avg_party_size ?? 0);
      this.reservationsLoading.set(false);
    });
  }

  toggleUpcomingOnly(): void {
    this.reservationsUpcomingOnly.update(v => !v);
  }

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

  toggleAllergen(key: string): void {
    this.editAllergene.update(list =>
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
      allergies:      this.editAllergies().trim() || null,
      blocked:        this.editBlocked(),
      blocked_reason: this.editBlocked() ? this.editReason().trim() : '',
      gasttypen:      this.editGasttypen(),
      hinweise:       this.editHinweise(),
      allergene:      this.editAllergene(),
      birthday:       this.editBirthday() || null,
      wedding_date:   this.editWeddingDate() || null,
    };

    this.guestsService.update(target.id, dto).subscribe({
      next: updated => {
        this.guests.update(list => list.map(g => g.id === updated.id ? updated : g));
        this.editTarget.set(updated);
        this.editSaving.set(false);
        this.closeEdit();
      },
      error: err => {
        this.editSaving.set(false);
        this.editError.set(err?.error?.error ?? 'Fehler beim Speichern.');
      },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  getGasttypenLabels(keys: string[]): ConfigItem[] {
    return this.availableGasttypen().filter(g => keys.includes(g.key));
  }

  getHinweiseLabels(keys: string[]): ConfigItem[] {
    return this.availableHinweise().filter(h => keys.includes(h.key));
  }

  getAllergeneLabels(keys: string[]): ConfigItem[] {
    return this.availableAllergene().filter(a => keys.includes(a.key));
  }

  reliabilityClass(score: number): string {
    if (score >= 90) return 'score--green';
    if (score >= 70) return 'score--yellow';
    return 'score--red';
  }

  initials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  formatRevenue(cents: number): string {
    if (!cents) return '—';
    return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  }

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  formatAvgPartySize(n: number): string {
    if (!n) return '—';
    return n % 1 === 0 ? `${n}` : n.toFixed(1);
  }

  resStatusInfo(status: string): { label: string; cls: string } {
    const map: Record<string, { label: string; cls: string }> = {
      confirmed:  { label: 'Bestätigt',     cls: 'status--confirmed' },
      pending:    { label: 'Ausstehend',     cls: 'status--pending'   },
      cancelled:  { label: 'Storniert',      cls: 'status--cancelled' },
      no_show:    { label: 'No-Show',        cls: 'status--noshow'    },
      seated:     { label: 'Anwesend',       cls: 'status--seated'    },
      completed:  { label: 'Abgeschlossen',  cls: 'status--completed' },
    };
    return map[status] ?? { label: status, cls: '' };
  }

  isUpcoming(startsAt: string): boolean {
    return startsAt >= new Date().toISOString().slice(0, 16);
  }

  isVip(g: Guest): boolean {
    return g.total_reservations >= this.vipThreshold();
  }

  isRegular(g: Guest): boolean {
    return !this.isVip(g) && g.total_reservations >= Math.max(2, Math.floor(this.vipThreshold() * 0.6));
  }

  guestStatusLabel(g: Guest): string {
    if (g.blocked) return 'Gesperrt';
    if (this.isVip(g)) return 'VIP';
    if (this.isRegular(g)) return 'Stammgast';
    return 'Neukunde';
  }
}
