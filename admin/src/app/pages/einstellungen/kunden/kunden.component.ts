import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { GuestsService, Guest, GuestReservation, UpdateGuestDto } from '../../../services/guests.service';
import { TenantSettingsService, ConfigItem } from '../../../services/tenant-settings.service';
import { ReminderService, Reminder } from '../../../services/reminder.service';
import { localDateIso, localDateTimeSpace } from '../../../shared/local-date.util';

type ModalTab  = 'profil' | 'hinweise' | 'reservierungen' | 'erinnerungen' | 'email';

export interface MailTemplate {
  key: 'confirmation' | 'reminder' | 'cancel' | 'no_show';
  label: string;
  description: string;
  icon: string;
  color: string;
}
type FilterKey = 'alle' | 'vip' | 'stammgast' | 'neukunde' | 'gesperrt' | 'noshows' | 'geburtstag' | 'jahrestag';

@Component({
  selector: 'app-kunden',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, TranslateModule],
  templateUrl: './kunden.component.html',
  styleUrl: './kunden.component.scss'
})
export class KundenComponent implements OnInit {
  private readonly guestsService   = inject(GuestsService);
  private readonly tenantSettings  = inject(TenantSettingsService);
  private readonly route           = inject(ActivatedRoute);
  readonly reminderSvc             = inject(ReminderService);

  readonly infoOpen = signal(false);

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

  // ── Sortierung ─────────────────────────────────────────────────────────────
  sortBy = signal<'name_asc' | 'name_desc' | 'bookings_desc' | 'bookings_asc' | 'noshows_desc' | 'reliability_desc' | 'since_desc' | 'since_asc'>('name_asc');
  sortMenuOpen = signal(false);

  readonly sortOptions: { value: 'name_asc' | 'name_desc' | 'bookings_desc' | 'bookings_asc' | 'noshows_desc' | 'reliability_desc' | 'since_desc' | 'since_asc'; label: string; icon: string }[] = [
    { value: 'name_asc',        label: 'Name A → Z',           icon: 'sort_by_alpha' },
    { value: 'name_desc',       label: 'Name Z → A',           icon: 'sort_by_alpha' },
    { value: 'bookings_desc',   label: 'Meiste Buchungen',      icon: 'event_note'    },
    { value: 'bookings_asc',    label: 'Wenigste Buchungen',    icon: 'event_note'    },
    { value: 'noshows_desc',    label: 'Meiste No-Shows',       icon: 'event_busy'    },
    { value: 'reliability_desc',label: 'Beste Zuverlässigkeit', icon: 'verified'      },
    { value: 'since_desc',      label: 'Neueste zuerst',        icon: 'schedule'      },
    { value: 'since_asc',       label: 'Älteste zuerst',        icon: 'history'       },
  ];

  toggleSortMenu() { this.sortMenuOpen.update(v => !v); }

  selectSort(value: 'name_asc' | 'name_desc' | 'bookings_desc' | 'bookings_asc' | 'noshows_desc' | 'reliability_desc' | 'since_desc' | 'since_asc') {
    this.sortBy.set(value);
    this.sortMenuOpen.set(false);
  }

  currentSortLabel = computed(() =>
    this.sortOptions.find(o => o.value === this.sortBy())?.label ?? 'Sortierung'
  );

  filteredGuests = computed(() => {
    let list = this.guests();
    switch (this.activeFilter()) {
      case 'vip':        list = list.filter(g => this.isVip(g)); break;
      case 'stammgast':  list = list.filter(g => this.isRegular(g)); break;
      case 'neukunde':   list = list.filter(g => !this.isVip(g) && !this.isRegular(g) && !g.blocked); break;
      case 'gesperrt':   list = list.filter(g => g.blocked); break;
      case 'noshows':    list = list.filter(g => g.no_show_count > 0); break;
      case 'geburtstag': list = list.filter(g => g.birthday?.slice(5) === this.todayMmDd); break;
      case 'jahrestag':  list = list.filter(g => g.wedding_date?.slice(5) === this.todayMmDd); break;
    }
    return [...list].sort((a, b) => {
      switch (this.sortBy()) {
        case 'name_asc':         return a.name.localeCompare(b.name, 'de');
        case 'name_desc':        return b.name.localeCompare(a.name, 'de');
        case 'bookings_desc':    return (b.total_reservations ?? 0) - (a.total_reservations ?? 0);
        case 'bookings_asc':     return (a.total_reservations ?? 0) - (b.total_reservations ?? 0);
        case 'noshows_desc':     return (b.no_show_count ?? 0) - (a.no_show_count ?? 0);
        case 'reliability_desc': return (b.reliability_score ?? 0) - (a.reliability_score ?? 0);
        case 'since_desc':       return (b.created_at ?? '').localeCompare(a.created_at ?? '');
        case 'since_asc':        return (a.created_at ?? '').localeCompare(b.created_at ?? '');
        default:                 return 0;
      }
    });
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
  readonly todayIso = localDateIso();

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
  editVorname = signal('');
  editNachname = signal('');
  editEmail   = signal('');
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
  editDeleting = signal(false);

  // ── Löschen-Bestätigung (schönes Modal statt Browser-confirm) ────────────
  confirmDeleteGuest = signal<Guest | null>(null);

  // ── Erinnerungen ──────────────────────────────────────────────────────────
  // Reaktiv: aktualisiert sich sobald reminderSvc._all sich ändert
  guestReminders = computed<Reminder[]>(() => {
    const guest = this.editTarget();
    if (!guest) return [];
    return this.reminderSvc.all().filter(r => r.guestId === guest.id);
  });
  newReminderNote = signal('');
  newReminderDate = signal('');
  reminderSaving  = signal(false);

  // ── E-Mail senden ─────────────────────────────────────────────────────────
  /** true wenn eine echte E-Mail hinterlegt ist (keine noemail.local-Platzhalter) */
  readonly hasRealEmail = computed(() => {
    const email = this.editTarget()?.email ?? '';
    return !!email && !email.endsWith('@noemail.local');
  });

  readonly mailTemplates: MailTemplate[] = [
    { key: 'confirmation', label: 'Reservierungsbestätigung', description: 'Bestätigung mit allen Reservierungsdetails und Stornierungs-Link', icon: 'check_circle',    color: 'blue'   },
    { key: 'reminder',     label: 'Erinnerungsmail',          description: 'Freundliche Erinnerung an den bevorstehenden Termin',                icon: 'alarm',           color: 'amber'  },
    { key: 'cancel',       label: 'Stornierungsbestätigung',  description: 'Bestätigung der Stornierung der Reservierung',                       icon: 'cancel',          color: 'red'    },
    { key: 'no_show',      label: 'No-Show Info',             description: 'Hinweis auf die verpasste Reservierung',                             icon: 'person_off',      color: 'grey'   },
  ];

  selectedMailTemplate = signal<MailTemplate['key'] | null>(null);
  selectedReservationId = signal<string>('');
  mailSending  = signal(false);
  mailSentOk   = signal(false);
  mailError    = signal<string | null>(null);

  // Computed: Reservierungen gefiltert
  filteredReservations = computed(() => {
    const list = this.reservations();
    if (this.reservationsUpcomingOnly()) {
      const now = localDateTimeSpace();
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

    const targetGuestId = this.route.snapshot.queryParamMap.get('guest');
    this.loading.set(true);
    this.guestsService.load({ search: this.search() || undefined }).subscribe(res => {
      this.guests.set(res.guests);
      this.total.set(res.total);
      this.loading.set(false);
      if (targetGuestId) {
        const found = res.guests.find(g => g.id === targetGuestId);
        if (found) this.openEdit(found);
      }
    });
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
    const { vorname, nachname } = this.splitName(guest.name);
    this.editVorname.set(vorname);
    this.editNachname.set(nachname);
    // Backend-Platzhalter (…@noemail.local) nie im editierbaren Feld anzeigen.
    this.editEmail.set(!guest.email.endsWith('@noemail.local') ? guest.email : '');
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
    this.newReminderNote.set('');
    this.newReminderDate.set('');
    this.selectedMailTemplate.set(null);
    this.selectedReservationId.set('');
    this.mailSentOk.set(false);
    this.mailError.set(null);
    this.editModal.set(true);
    // Sidebar-Statistik "Ø Gruppengröße" wird immer angezeigt (nicht nur im Tab
    // "Reservierungen"), daher hier sofort laden statt erst bei Tab-Wechsel.
    this.loadGuestReservations();
  }

  closeEdit(): void { this.editModal.set(false); }

  setTab(tab: ModalTab): void {
    this.activeTab.set(tab);
    if (tab === 'reservierungen' && this.reservations().length === 0 && !this.reservationsLoading()) {
      this.loadGuestReservations();
    }
    if (tab === 'erinnerungen') {
      // guestReminders ist ein computed Signal — kein manuelles Set nötig
    }
    if (tab === 'email') {
      this.selectedMailTemplate.set(null);
      this.selectedReservationId.set('');
      this.mailSentOk.set(false);
      this.mailError.set(null);
      // Reservierungen laden falls noch nicht vorhanden
      if (this.reservations().length === 0 && !this.reservationsLoading()) {
        this.loadGuestReservations();
      }
    }
  }

  sendMail(): void {
    const guest    = this.editTarget();
    const tplKey   = this.selectedMailTemplate();
    if (!guest || !tplKey) return;

    this.mailSending.set(true);
    this.mailError.set(null);
    this.mailSentOk.set(false);

    this.guestsService.resendEmail(
      guest.id,
      tplKey,
      this.selectedReservationId() || undefined,
    ).subscribe({
      next: () => {
        this.mailSending.set(false);
        this.mailSentOk.set(true);
        this.selectedMailTemplate.set(null);
        setTimeout(() => this.mailSentOk.set(false), 3500);
      },
      error: (err) => {
        this.mailSending.set(false);
        this.mailError.set(err?.error?.error ?? 'Fehler beim Versenden.');
      },
    });
  }

  addReminder(): void {
    const guest = this.editTarget();
    if (!guest || !this.newReminderNote().trim() || !this.newReminderDate()) return;
    this.reminderSvc.add(guest.id, guest.name, this.newReminderNote(), this.newReminderDate());
    this.newReminderNote.set('');
    this.newReminderDate.set('');
  }

  deleteReminder(id: string): void {
    this.reminderSvc.remove(id);
  }

  /** Öffnet den nativen Datepicker, auch wenn nicht exakt auf das kleine Kalender-Icon geklickt wird. */
  openDatePicker(input: HTMLInputElement): void {
    input.showPicker?.();
  }

  reminderIsDue(dueDate: string): boolean {
    return dueDate <= localDateIso();
  }

  formatReminderDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
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
    if (!target || !this.editVorname().trim()) return;

    const fullName = [this.editVorname().trim(), this.editNachname().trim()].filter(Boolean).join(' ');

    this.editSaving.set(true);
    this.editError.set(null);

    const dto: UpdateGuestDto = {
      name:           fullName,
      email:          this.editEmail().trim() || null,
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

  askDeleteGuest(): void {
    const target = this.editTarget();
    if (!target) return;
    this.confirmDeleteGuest.set(target);
  }

  cancelDeleteGuest(): void {
    this.confirmDeleteGuest.set(null);
  }

  confirmDeleteGuestAction(): void {
    const target = this.confirmDeleteGuest();
    if (!target) return;

    this.editDeleting.set(true);
    this.editError.set(null);

    this.guestsService.delete(target.id).subscribe({
      next: () => {
        this.guests.update(list => list.filter(g => g.id !== target.id));
        this.total.update(t => Math.max(0, t - 1));
        this.editDeleting.set(false);
        this.confirmDeleteGuest.set(null);
        this.closeEdit();
      },
      error: err => {
        this.editDeleting.set(false);
        this.confirmDeleteGuest.set(null);
        this.editError.set(err?.error?.error ?? 'Fehler beim Löschen.');
      },
    });
  }

  private splitName(full: string): { vorname: string; nachname: string } {
    const parts = full.trim().split(/\s+/);
    return { vorname: parts[0] ?? '', nachname: parts.slice(1).join(' ') };
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
    return startsAt >= localDateTimeSpace();
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
