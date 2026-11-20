import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AddonsService, AddOn, Plan } from '../../services/addons.service';

interface AddOnForm {
  key: string;
  name: string;
  description: string;
  price: number | null;
  minPlan: '' | Plan;
  includedFromPlan: '' | Plan;
  icon: string;
  status: 'active' | 'soon';
  sortOrder: number;
}

function emptyForm(): AddOnForm {
  return {
    key: '', name: '', description: '', price: null,
    minPlan: '', includedFromPlan: '', icon: 'extension',
    status: 'active', sortOrder: 0,
  };
}

@Component({
  selector: 'app-addons',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: './addons.component.html',
  styleUrl: './addons.component.scss',
})
export class AddonsComponent implements OnInit {
  private readonly svc = inject(AddonsService);

  addons  = signal<AddOn[]>([]);
  loading = signal(true);

  modalOpen = signal(false);
  editingId = signal<string | null>(null);
  saving    = signal(false);
  error     = signal('');
  form: AddOnForm = emptyForm();

  readonly plans: { key: Plan; label: string }[] = [
    { key: 'tisch',  label: 'Tisch' },
    { key: 'menu',   label: 'Menü' },
    { key: 'maitre', label: 'Maître' },
  ];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.svc.list().subscribe({
      next: a => { this.addons.set(a); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  formatPrice(cents: number | null): string {
    if (cents == null) return 'Auf Anfrage';
    return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' € / Monat';
  }

  planLabel(plan: string | null): string {
    if (!plan) return '—';
    return { tisch: 'Tisch', menu: 'Menü', maitre: 'Maître' }[plan] ?? plan;
  }

  openCreate(): void {
    this.form = emptyForm();
    this.editingId.set(null);
    this.error.set('');
    this.modalOpen.set(true);
  }

  openEdit(a: AddOn): void {
    this.form = {
      key: a.key,
      name: a.name,
      description: a.description ?? '',
      price: a.priceCents != null ? a.priceCents / 100 : null,
      minPlan: a.minPlan ?? '',
      includedFromPlan: a.includedFromPlan ?? '',
      icon: a.icon,
      status: a.status,
      sortOrder: a.sortOrder,
    };
    this.editingId.set(a.id);
    this.error.set('');
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  save(): void {
    if (!this.form.name.trim()) {
      this.error.set('Name ist ein Pflichtfeld.');
      return;
    }
    if (!this.editingId() && !this.form.key.trim()) {
      this.error.set('Key ist ein Pflichtfeld.');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    const dto = {
      name:              this.form.name.trim(),
      description:       this.form.description.trim() || undefined,
      priceCents:        this.form.price != null ? Math.round(this.form.price * 100) : null,
      minPlan:           this.form.minPlan || null,
      includedFromPlan:  this.form.includedFromPlan || null,
      icon:              this.form.icon.trim() || 'extension',
      status:            this.form.status,
      sortOrder:         this.form.sortOrder,
    };

    const editing = this.editingId();
    const req = editing
      ? this.svc.update(editing, dto)
      : this.svc.create({ key: this.form.key.trim(), ...dto });

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err.error?.error ?? 'Fehler beim Speichern.');
      },
    });
  }

  remove(a: AddOn, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Add-on "${a.name}" wirklich löschen? Tenants die es aktiv haben, verlieren die Zuordnung nicht automatisch — die Anzeige im Admin verschwindet aber.`)) {
      return;
    }
    this.svc.delete(a.id).subscribe(() => this.load());
  }
}