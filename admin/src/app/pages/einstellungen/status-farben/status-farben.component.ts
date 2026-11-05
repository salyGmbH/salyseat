import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

type ConfigItem = {
  label: string;
  key: string;
  color: string;
  icon?: string;
};

@Component({
  selector: 'app-status-farben',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './status-farben.component.html',
  styleUrl: './status-farben.component.scss'
})
export class StatusFarbenComponent {


  statusView: 'text' | 'svg' = 'text';
  hinweisView: 'text' | 'svg' = 'text';
  gastView: 'text' | 'svg' = 'text';

  sortMode: 'status' | 'time' | 'combined' = 'status';


  modalOpen = false;
  modalType: 'hinweis' | 'gast' | null = null;

  newItem: ConfigItem = {
    label: '',
    key: '',
    color: '#3b82f6',
    icon: 'default'
  };


  statusInfo = false;
  hinweisInfo = false;
  gastInfo = false;
  sortInfo = false;

  statusSaved = false;
  hinweisSaved = false;
  gastSaved = false;
  sortSaved = false;

  defaultStatuses: ConfigItem[] = [
    { key: 'waiting', label: 'Warteliste', color: '#f59e0b', icon: 'circle' },
    { key: 'active', label: 'Aktiv', color: '#22c55e', icon: 'check' },
    { key: 'late', label: 'Verspätet', color: '#eab308', icon: 'clock' },
    { key: 'paid', label: 'Bezahlt', color: '#3b82f6', icon: 'money' },
    { key: 'completed', label: 'Beendet', color: '#6b7280', icon: 'done' },
    { key: 'no_show', label: 'No Show', color: '#991b1b', icon: 'close' },
    { key: 'cancelled', label: 'Storniert', color: '#9ca3af', icon: 'minus' },
  ];

  defaultHinweise: ConfigItem[] = [
    { key: 'allergy', label: 'Allergie', color: '#ef4444', icon: 'alert' },
    { key: 'intolerance', label: 'Unverträglichkeit', color: '#f97316', icon: 'alert' },
    { key: 'birthday', label: 'Geburtstag', color: '#a855f7', icon: 'gift' },
    { key: 'note', label: 'Notiz vorhanden', color: '#64748b', icon: 'note' },
  ];

  defaultGasttypen: ConfigItem[] = [
    { key: 'vip', label: 'VIP Gast', color: '#eab308', icon: 'star' },
    { key: 'regular', label: 'Stammgast', color: '#22c55e', icon: 'user' },
    { key: 'new', label: 'Neukunde', color: '#3b82f6', icon: 'user_plus' },
    { key: 'blacklist', label: 'Blacklist', color: '#991b1b', icon: 'ban' },
  ];

  // =========================
  // 🔥 AKTIVE DATEN
  // =========================
  statuses: ConfigItem[] = JSON.parse(JSON.stringify(this.defaultStatuses));
  hinweise: ConfigItem[] = JSON.parse(JSON.stringify(this.defaultHinweise));
  gasttypen: ConfigItem[] = JSON.parse(JSON.stringify(this.defaultGasttypen));

  // =========================
  // 🔥 VIEW SETTER
  // =========================
  setStatusView(mode: 'text' | 'svg') {
    this.statusView = mode;
  }

  setHinweisView(mode: 'text' | 'svg') {
    this.hinweisView = mode;
  }

  setGastView(mode: 'text' | 'svg') {
    this.gastView = mode;
  }

  setSortMode(mode: 'status' | 'time' | 'combined') {
    this.sortMode = mode;
  }


  toggleStatusInfo() {
    this.statusInfo = !this.statusInfo;
    this.hinweisInfo = this.gastInfo = this.sortInfo = false;
  }

  toggleHinweisInfo() {
    this.hinweisInfo = !this.hinweisInfo;
    this.statusInfo = this.gastInfo = this.sortInfo = false;
  }

  toggleGastInfo() {
    this.gastInfo = !this.gastInfo;
    this.statusInfo = this.hinweisInfo = this.sortInfo = false;
  }

  toggleSortInfo() {
    this.sortInfo = !this.sortInfo;
    this.statusInfo = this.hinweisInfo = this.gastInfo = false;
  }

  // =========================
  // 🔥 HELPER
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


  saveStatus() {
    console.log('Status gespeichert:', this.statuses, this.statusView);
    this.triggerSaved('status');
  }

  saveHinweise() {
    console.log('Hinweise gespeichert:', this.hinweise, this.hinweisView);
    this.triggerSaved('hinweis');
  }

  saveGasttypen() {
    console.log('Gasttypen gespeichert:', this.gasttypen, this.gastView);
    this.triggerSaved('gast');
  }

  saveSort() {
    console.log('Sortierung gespeichert:', this.sortMode);
    this.triggerSaved('sort');
  }

  private triggerSaved(type: 'status' | 'hinweis' | 'gast' | 'sort') {
    const map = {
      status: () => this.statusSaved = true,
      hinweis: () => this.hinweisSaved = true,
      gast: () => this.gastSaved = true,
      sort: () => this.sortSaved = true
    };

    map[type]();
    setTimeout(() => {
      this.statusSaved = this.hinweisSaved = this.gastSaved = this.sortSaved = false;
    }, 2000);
  }


  resetStatusColors() {
    this.statuses = JSON.parse(JSON.stringify(this.defaultStatuses));
  }

  resetHinweiseColors() {
    this.hinweise = JSON.parse(JSON.stringify(this.defaultHinweise));
  }

  resetGasttypenColors() {
    this.gasttypen = JSON.parse(JSON.stringify(this.defaultGasttypen));
  }

  openModal(type: 'hinweis' | 'gast') {
    this.modalType = type;
    this.modalOpen = true;

    this.newItem = {
      label: '',
      key: '',
      color: '#3b82f6',
      icon: 'default'
    };
  }

  closeModal() {
    this.modalOpen = false;
    this.modalType = null;
  }

  addItem() {
    if (!this.newItem.label.trim()) return;

    const newEntry: ConfigItem = {
      label: this.newItem.label,
      key: this.newItem.label.toLowerCase().replace(/\s+/g, '_'),
      color: this.newItem.color,
      icon: this.newItem.icon || 'default'
    };

    if (this.modalType === 'hinweis') {
      this.hinweise.push(newEntry);
    }

    if (this.modalType === 'gast') {
      this.gasttypen.push(newEntry);
    }

    this.closeModal();
  }
}