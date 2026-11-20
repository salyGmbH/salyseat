import { Component, EventEmitter, HostListener, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { StaffService, VerifiedStaff } from '../../services/staff.service';

/**
 * Wiederverwendbare Mitarbeiter-ID-Abfrage. Löst die eingegebene Mitarbeiter-Nummer
 * per StaffService.verify() auf und bestätigt nur, wenn `requireRole` (falls gesetzt)
 * mit der aufgelösten Rolle übereinstimmt. Dient sowohl als reine Audit-Trail-Abfrage
 * (kein requireRole) als auch als Autorisierungs-Schritt (requireRole: 'admin') —
 * die eigentliche Durchsetzung passiert in beiden Fällen serverseitig, hier nur UX.
 */
@Component({
  selector: 'app-staff-id-prompt',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './staff-id-prompt.component.html',
  styleUrl: './staff-id-prompt.component.scss',
})
export class StaffIdPromptComponent {
  private readonly staffService = inject(StaffService);

  @Input() open = false;
  @Input() title = 'Mitarbeiter-ID bestätigen';
  @Input() message = 'Bitte gib deine Mitarbeiter-Nummer ein.';
  @Input() requireRole: 'admin' | null = null;

  @Output() confirmed = new EventEmitter<VerifiedStaff & { employeeNumber: number }>();
  @Output() cancelled = new EventEmitter<void>();

  numberInput = signal('');
  verifying   = signal(false);
  error       = signal<string | null>(null);

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open) this.cancel();
  }

  submit(): void {
    const number = parseInt(this.numberInput(), 10);
    if (!number || number <= 0) {
      this.error.set('Bitte eine gültige Mitarbeiter-Nummer eingeben.');
      return;
    }

    this.verifying.set(true);
    this.error.set(null);

    this.staffService.verify(number).subscribe({
      next: (staff) => {
        this.verifying.set(false);

        if (this.requireRole && staff.role !== this.requireRole) {
          this.error.set(`${staff.name} hat nicht die erforderliche Rolle.`);
          return;
        }

        this.confirmed.emit({ ...staff, employeeNumber: number });
        this.reset();
      },
      error: () => {
        this.verifying.set(false);
        this.error.set('Mitarbeiter-Nummer nicht gefunden.');
      },
    });
  }

  cancel(): void {
    this.cancelled.emit();
    this.reset();
  }

  private reset(): void {
    this.numberInput.set('');
    this.error.set(null);
    this.verifying.set(false);
  }
}