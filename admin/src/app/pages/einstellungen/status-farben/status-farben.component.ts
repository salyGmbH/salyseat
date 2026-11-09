import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { StatusColorsService } from '../../../services/status-colors.service';
import { ReservationTimingService } from '../../../services/reservation-timing.service';
import { TenantSettingsService, ConfigItem } from '../../../services/tenant-settings.service';
import {
  StatusIconComponent,
  STATUS_ICON_IDS,
  STATUS_ICONS_META,
  SUGGESTED_ICONS_BY_STATUS,
  StatusIconId,
} from '../../../shared/status-icon/status-icon.component';

@Component({
  selector: 'app-status-farben',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, RouterLink, TranslateModule, StatusIconComponent],
  templateUrl: './status-farben.component.html',
  styleUrl: './status-farben.component.scss'
})
export class StatusFarbenComponent implements OnInit {

  private readonly statusColorsService = inject(StatusColorsService);
  private readonly tenantSettings = inject(TenantSettingsService);
  /**
   * Lese-Zugriff auf Timing-Settings — wird auf dieser Seite nur gelesen
   * (gesetzt wird die Cleanup-Zeit unter Einstellungen → Reservierungen).
   * So kann hier in der Vorschau direkt der aktuelle Wert eingeblendet werden.
   */
  readonly timing = inject(ReservationTimingService);

  // =========================
  // VIEW MODES
  // =========================
  statusView: 'card' | 'text' | 'svg' = this.statusColorsService.viewMode();
  hinweisView: 'text' | 'svg' = 'text';
  gastView: 'text' | 'svg' = 'text';
  allergenView: 'text' | 'svg' = 'text';
  sortMode: 'status' | 'time' | 'combined' = 'status';

  // =========================
  // MODAL STATE
  // =========================
  modalOpen = false;
  modalType: 'hinweis' | 'gast' | 'allergen' | null = null;

  newItem: ConfigItem = { label: '', key: '', color: '#3b82f6', icon: 'default' };

  // =========================
  // UI STATE
  // =========================
  statusInfo = false;
  hinweisInfo = false;
  gastInfo = false;
  allergenInfo = false;
  sortInfo = false;

  statusSaved = false;
  hinweisSaved = false;
  gastSaved = false;
  allergenSaved = false;
  sortSaved = false;

  // =========================
  // BEISPIEL-RESERVIERUNGEN
  // =========================
  sampleReservations = [
    { key: 'waiting',   time: '12:00', name: 'Müller',   party: 4, table: 3 },
    { key: 'active',    time: '12:30', name: 'Schmidt',  party: 2, table: 7 },
    { key: 'late',      time: '13:00', name: 'Kaiser',   party: 6, table: 12 },
    // Standard-Dauer abgelaufen → Tisch ist nominell belegt aber Zeit überzogen
    { key: 'expired',   time: '13:15', name: 'Neumann',  party: 3, table: 8 },
    // Gäste sind weg, Tisch wird gerade gereinigt → Cleanup-Zeit aus den
    // Reservierungs-Settings.
    { key: 'cleanup',   time: '13:20', name: 'Schulz',   party: 2, table: 6 },
    { key: 'paid',      time: '13:30', name: 'Becker',   party: 3, table: 5 },
    { key: 'completed', time: '14:00', name: 'Weber',    party: 2, table: 1 },
    { key: 'no_show',   time: '14:30', name: 'Fischer',  party: 4, table: 9 },
    { key: 'cancelled', time: '15:00', name: 'Hofmann',  party: 2, table: 4 },
  ];

  // =========================
  // DEFAULTS
  // =========================
  defaultStatuses: ConfigItem[] = this.statusColorsService.defaults().map(s => ({ ...s }));

  defaultHinweise: ConfigItem[] = [
    { key: 'intolerance', label: 'Unverträglichkeit',  color: '#f97316', icon: 'alert' },
    { key: 'birthday',    label: 'Geburtstag',         color: '#a855f7', icon: 'gift' },
    { key: 'note',        label: 'Notiz vorhanden',    color: '#64748b', icon: 'note' },
  ];

  defaultGasttypen: ConfigItem[] = [
    { key: 'vip',       label: 'VIP Gast',  color: '#eab308', icon: 'star' },
    { key: 'regular',   label: 'Stammgast', color: '#22c55e', icon: 'user' },
    { key: 'new',       label: 'Neukunde',  color: '#3b82f6', icon: 'user_plus' },
    { key: 'blacklist', label: 'Blacklist', color: '#991b1b', icon: 'ban' },
  ];

  /**
   * Vollständige EU-Liste der 14 deklarationspflichtigen Hauptallergene
   * gemäß EU-Verordnung 1169/2011 (LMIV), Anhang II.
   * Reihenfolge & Nummerierung folgt der offiziellen EU-Auflistung.
   * Restaurant kann via "+" weitere ergänzen oder über "Standard" zurücksetzen.
   */
  defaultAllergene: ConfigItem[] = [
    { key: 'gluten',      label: 'Gluten',                color: '#b45309', icon: 'wheat' },
    { key: 'crustaceans', label: 'Krebstiere',            color: '#f97316', icon: 'shrimp' },
    { key: 'eggs',        label: 'Eier',                  color: '#facc15', icon: 'egg' },
    { key: 'fish',        label: 'Fisch',                 color: '#0891b2', icon: 'fish' },
    { key: 'peanuts',     label: 'Erdnüsse',              color: '#d97706', icon: 'peanut' },
    { key: 'soy',         label: 'Soja',                  color: '#84cc16', icon: 'bean' },
    { key: 'milk',        label: 'Milch / Laktose',        color: '#94a3b8', icon: 'milk' },
    { key: 'nuts',        label: 'Nüsse (Schalenfrüchte)', color: '#92400e', icon: 'nut' },
    { key: 'celery',      label: 'Sellerie',              color: '#65a30d', icon: 'leaf' },
    { key: 'mustard',     label: 'Senf',                  color: '#eab308', icon: 'mustard' },
    { key: 'sesame',      label: 'Sesam',                 color: '#c2a072', icon: 'seed' },
    { key: 'sulphites',   label: 'Schwefeldioxid / Sulfite', color: '#a855f7', icon: 'flask' },
    { key: 'lupin',       label: 'Lupinen',               color: '#c084fc', icon: 'flower' },
    { key: 'molluscs',    label: 'Weichtiere',            color: '#1e3a8a', icon: 'shell' },
  ];

  // =========================
  // AKTIVE DATEN
  // =========================
  statuses: ConfigItem[] = this.statusColorsService.statuses().map(s => ({ ...s }));
  hinweise: ConfigItem[] = JSON.parse(JSON.stringify(this.defaultHinweise));
  gasttypen: ConfigItem[] = JSON.parse(JSON.stringify(this.defaultGasttypen));
  allergene: ConfigItem[] = JSON.parse(JSON.stringify(this.defaultAllergene));

  ngOnInit(): void {
    // Alle Einstellungen vom Backend laden und in die lokalen Arrays übernehmen
    this.tenantSettings.load().subscribe(settings => {
      if (settings.statuses?.length) {
        this.statuses = this.statusColorsService.defaults().map(def => {
          const found = settings.statuses!.find(p => p.key === def.key);
          return found ? { ...def, ...found } : { ...def };
        });
      }
      if (settings.statusView)  this.statusView  = settings.statusView;
      if (settings.hinweise?.length)  this.hinweise  = JSON.parse(JSON.stringify(settings.hinweise));
      if (settings.hinweisView) this.hinweisView = settings.hinweisView;
      if (settings.gasttypen?.length) this.gasttypen = JSON.parse(JSON.stringify(settings.gasttypen));
      if (settings.gastView)    this.gastView    = settings.gastView;
      if (settings.allergene?.length) this.allergene = JSON.parse(JSON.stringify(settings.allergene));
      if (settings.allergenView) this.allergenView = settings.allergenView;
      if (settings.sortMode)    this.sortMode    = settings.sortMode;
    });
  }

  getStatusByKey(key: string): ConfigItem | undefined {
    return this.statuses.find(s => s.key === key);
  }

  // =========================
  // ICON PICKER
  // =========================
  iconPickerOpenFor: string | null = null;
  readonly allIconsMeta = STATUS_ICONS_META;

  toggleIconPicker(statusKey: string): void {
    this.iconPickerOpenFor = this.iconPickerOpenFor === statusKey ? null : statusKey;
  }

  closeIconPicker(): void { this.iconPickerOpenFor = null; }

  getSuggestedIcons(statusKey: string): StatusIconId[] {
    return SUGGESTED_ICONS_BY_STATUS[statusKey] ?? [];
  }

  getOtherIcons(statusKey: string): StatusIconId[] {
    const suggested = new Set<string>(this.getSuggestedIcons(statusKey));
    return STATUS_ICON_IDS.filter(id => !suggested.has(id));
  }

  selectIcon(statusKey: string, iconId: StatusIconId): void {
    const status = this.statuses.find(s => s.key === statusKey);
    if (!status) return;
    status.icon = iconId;
    this.closeIconPicker();
  }

  resolveIcon(status: ConfigItem): string {
    const icon = status.icon ?? '';
    if ((STATUS_ICON_IDS as readonly string[]).includes(icon)) return icon;
    const suggested = this.getSuggestedIcons(status.key);
    return suggested[0] ?? 'circle-dot';
  }

  // =========================
  // VIEW SETTER
  // =========================
  setStatusView(mode: 'card' | 'text' | 'svg') { this.statusView = mode; }
  setHinweisView(mode: 'text' | 'svg') { this.hinweisView = mode; }
  setGastView(mode: 'text' | 'svg') { this.gastView = mode; }
  setAllergenView(mode: 'text' | 'svg') { this.allergenView = mode; }
  setSortMode(mode: 'status' | 'time' | 'combined') { this.sortMode = mode; }

  // =========================
  // INFO TOGGLES
  // =========================
  toggleStatusInfo() {
    this.statusInfo = !this.statusInfo;
    this.hinweisInfo = this.gastInfo = this.allergenInfo = this.sortInfo = false;
  }
  toggleHinweisInfo() {
    this.hinweisInfo = !this.hinweisInfo;
    this.statusInfo = this.gastInfo = this.allergenInfo = this.sortInfo = false;
  }
  toggleGastInfo() {
    this.gastInfo = !this.gastInfo;
    this.statusInfo = this.hinweisInfo = this.allergenInfo = this.sortInfo = false;
  }
  toggleAllergenInfo() {
    this.allergenInfo = !this.allergenInfo;
    this.statusInfo = this.hinweisInfo = this.gastInfo = this.sortInfo = false;
  }
  toggleSortInfo() {
    this.sortInfo = !this.sortInfo;
    this.statusInfo = this.hinweisInfo = this.gastInfo = this.allergenInfo = false;
  }

  // =========================
  // HELPER
  // =========================
  getTextColor(hex: string) {
    const c = hex.substring(1);
    const rgb = parseInt(c, 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 150 ? '#000' : '#fff';
  }

  // =========================
  // SAVE — jeder Block speichert den vollständigen Payload
  // =========================
  private buildPayload() {
    return {
      statuses:     this.statuses as any,
      statusView:   this.statusView,
      hinweise:     this.hinweise,
      hinweisView:  this.hinweisView,
      gasttypen:    this.gasttypen,
      gastView:     this.gastView,
      allergene:    this.allergene,
      allergenView: this.allergenView,
      sortMode:     this.sortMode,
    };
  }

  saveStatus() {
    this.statusColorsService.setAll(this.statuses as any);
    this.statusColorsService.setViewMode(this.statusView);
    this.tenantSettings.save(this.buildPayload()).subscribe(() => this.triggerSaved('status'));
  }

  saveHinweise() {
    this.tenantSettings.save(this.buildPayload()).subscribe(() => this.triggerSaved('hinweis'));
  }

  saveGasttypen() {
    this.tenantSettings.save(this.buildPayload()).subscribe(() => this.triggerSaved('gast'));
  }

  saveAllergene() {
    this.tenantSettings.save(this.buildPayload()).subscribe(() => this.triggerSaved('allergen'));
  }

  saveSort() {
    this.tenantSettings.save(this.buildPayload()).subscribe(() => this.triggerSaved('sort'));
  }

  private triggerSaved(type: 'status' | 'hinweis' | 'gast' | 'allergen' | 'sort') {
    const map = {
      status:   () => this.statusSaved = true,
      hinweis:  () => this.hinweisSaved = true,
      gast:     () => this.gastSaved = true,
      allergen: () => this.allergenSaved = true,
      sort:     () => this.sortSaved = true,
    };
    map[type]();
    setTimeout(() => {
      this.statusSaved = this.hinweisSaved = this.gastSaved = this.allergenSaved = this.sortSaved = false;
    }, 2000);
  }

  // =========================
  // RESET
  // =========================
  resetStatusColors() {
    this.statusColorsService.reset();
    this.statuses    = this.statusColorsService.statuses().map(s => ({ ...s }));
    this.statusView  = this.statusColorsService.viewMode();
    this.tenantSettings.save(this.buildPayload()).subscribe();
  }

  resetHinweiseColors() {
    this.hinweise = JSON.parse(JSON.stringify(this.defaultHinweise));
    this.tenantSettings.save(this.buildPayload()).subscribe();
  }

  resetGasttypenColors() {
    this.gasttypen = JSON.parse(JSON.stringify(this.defaultGasttypen));
    this.tenantSettings.save(this.buildPayload()).subscribe();
  }

  resetAllergeneColors() {
    this.allergene = JSON.parse(JSON.stringify(this.defaultAllergene));
    this.tenantSettings.save(this.buildPayload()).subscribe();
  }

  // =========================
  // MODAL
  // =========================
  openModal(type: 'hinweis' | 'gast' | 'allergen') {
    this.modalType = type;
    this.modalOpen = true;
    this.newItem = { label: '', key: '', color: '#3b82f6', icon: 'default' };
  }

  closeModal() {
    this.modalOpen = false;
    this.modalType = null;
  }

  /** Modal-Titel je nach Typ. */
  get modalTitle(): string {
    switch (this.modalType) {
      case 'hinweis':  return 'Hinweis hinzufügen';
      case 'gast':     return 'Gasttyp hinzufügen';
      case 'allergen': return 'Allergen hinzufügen';
      default:         return '';
    }
  }

  addItem() {
    if (!this.newItem.label.trim()) return;
    const newEntry: ConfigItem = {
      label: this.newItem.label,
      key:   this.newItem.label.toLowerCase().replace(/\s+/g, '_'),
      color: this.newItem.color,
      icon:  this.newItem.icon || 'default',
    };
    if (this.modalType === 'hinweis')  this.hinweise.push(newEntry);
    if (this.modalType === 'gast')     this.gasttypen.push(newEntry);
    if (this.modalType === 'allergen') this.allergene.push(newEntry);
    this.closeModal();
  }
}
