import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';
import { VenueService } from '../../../services/venue.service';
import { WidgetFunctionalService } from '../../../services/widget-functional.service';

@Component({
  selector: 'app-widget-einstellungen',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './widget-einstellungen.component.html',
  styleUrl: './widget-einstellungen.component.scss'
})
export class WidgetEinstellungenComponent implements OnInit {

  private readonly venueService        = inject(VenueService);
  private readonly widgetFunctionalSvc = inject(WidgetFunctionalService);

  constructor() {
    toObservable(this.widgetFunctionalSvc.isLoaded)
      .pipe(filter(loaded => loaded), take(1))
      .subscribe(() => {
        Object.assign(this.settings, this.widgetFunctionalSvc.settings());
        this.initRaumauswahl();
      });
  }

  // ─── Info-Toggles ────────────────────────────────────────────────────────────
  info1  = signal(false); info2  = signal(false); info3  = signal(false);
  info4  = signal(false); info5  = signal(false); info6  = signal(false);
  info7  = signal(false); info8  = signal(false); info9  = signal(false);
  info10 = signal(false); info11 = signal(false); info12 = signal(false);
  info13 = signal(false); info14 = signal(false);

  // ─── Per-Block saved signals ─────────────────────────────────────────────────
  saved1  = signal(false); saved2  = signal(false); saved3  = signal(false);
  saved4  = signal(false); saved5  = signal(false); saved6  = signal(false);
  saved7  = signal(false); saved8  = signal(false); saved9  = signal(false);
  saved10 = signal(false); saved11 = signal(false); saved12 = signal(false);
  saved13 = signal(false); saved14 = signal(false);

  saveBlock(n: number): void {
    const all = [
      this.saved1, this.saved2, this.saved3, this.saved4, this.saved5,
      this.saved6, this.saved7, this.saved8, this.saved9, this.saved10,
      this.saved11, this.saved12, this.saved13, this.saved14
    ];
    const s = all[n - 1];
    if (!s) return;
    this.widgetFunctionalSvc.save({ ...this.settings });
    s.set(true);
    setTimeout(() => s.set(false), 2500);
  }

  // ─── Settings ────────────────────────────────────────────────────────────────
  settings = {
    // 1. Intervall
    intervall: 30,

    // 2. Speisekarte
    speisekarte: false,
    speisekarteType: 'url' as 'url' | 'pdf',
    speisekarteUrl: '',
    speisekartePdfName: '',

    // 3. Package-Buchung
    packageBuchung: false,

    // 4. Ausstehende Bestätigung
    ausstehendBestaetigung: false,
    ausstehendScope: 'immer' as 'immer' | 'tage',
    ausstehendDaten: [] as string[],
    ausstehendUhrzeitAktiv: false,
    ausstehendUhrzeiten: [] as { von: string; bis: string }[],

    // 5. Raumauswahl
    raumauswahl: false,
    raumauswahlAktiveIds: [] as string[],

    // 6. Hinweistext
    hinweistext: false,
    hinweistextUeberschrift: '',
    hinweistextInhalt: '',
    hinweistextFooter: '',

    // 7. Pflichtfelder
    pflichtfelder: ['name', 'partySize'] as string[],

    // 8. Max. Personenanzahl
    maxPersonen: 8,
    maxPersonenText: 'Für Gruppen ab dieser Personenzahl bitten wir um Kontaktaufnahme.',
    maxPersonenPhone: '',
    maxPersonenEmail: '',

    // 9. Kinderstühle
    kinderStuehleAktiv: false,
    kinderStuehleGesamt: 4,
    kinderStuehleOnline: 2,

    // 10. Vorausbuchung
    vorausbuchungEinheit: 'monate' as 'tage' | 'monate',
    vorausbuchungWert: 12,

    // 11. Mindestvorlaufzeit
    mindestvorlaufMinuten: 60,

    // 12. Tischarten
    tischartenAktiv: false,
    tischartenAktiveTypes: ['round', 'square', 'long'] as string[],

    // 13. Online Änderungen
    onlineAenderungen: false,
    onlineAenderungenMinuten: 120,

    // 14. Online Stornierung
    onlineStornierung: false,
    onlineStornierungMinuten: 120,
  };

  // ─── Räume ───────────────────────────────────────────────────────────────────
  readonly venues = this.venueService.venues;

  ngOnInit(): void {
    if (!this.venueService.loaded()) {
      this.venueService.load().subscribe(() => this.initRaumauswahl());
    } else {
      this.initRaumauswahl();
    }
  }

  private initRaumauswahl(): void {
    if (this.settings.raumauswahlAktiveIds.length === 0) {
      this.settings.raumauswahlAktiveIds = this.venues().map(v => v.id);
    }
  }

  isRaumAktiv(id: string): boolean {
    return this.settings.raumauswahlAktiveIds.includes(id);
  }

  toggleRaum(id: string): void {
    this.settings.raumauswahlAktiveIds = this.isRaumAktiv(id)
      ? this.settings.raumauswahlAktiveIds.filter(x => x !== id)
      : [...this.settings.raumauswahlAktiveIds, id];
  }

  get aktiveRaumCount(): number {
    return this.settings.raumauswahlAktiveIds.length;
  }

  // ─── Tischarten ──────────────────────────────────────────────────────────────
  readonly alleTischarten = [
    { key: 'round',  label: 'Runder Tisch',     icon: 'circle',      shape: 'round'  },
    { key: 'square', label: 'Viereckiger Tisch', icon: 'crop_square', shape: 'square' },
    { key: 'long',   label: 'Langer Tisch',      icon: 'table_rows',  shape: 'long'   },
  ];

  isTischartenAktiv(key: string): boolean {
    return this.settings.tischartenAktiveTypes.includes(key);
  }

  toggleTischart(key: string): void {
    this.settings.tischartenAktiveTypes = this.isTischartenAktiv(key)
      ? this.settings.tischartenAktiveTypes.filter(k => k !== key)
      : [...this.settings.tischartenAktiveTypes, key];
  }

  // ─── Datum / Uhrzeit Block 4 ─────────────────────────────────────────────────
  newDatum = '';

  addDatum(): void {
    const d = this.newDatum;
    if (!d || this.settings.ausstehendDaten.includes(d)) return;
    this.settings.ausstehendDaten = [...this.settings.ausstehendDaten, d].sort();
    this.newDatum = '';
  }

  removeDatum(d: string): void {
    this.settings.ausstehendDaten = this.settings.ausstehendDaten.filter(x => x !== d);
  }

  formatDatum(iso: string): string {
    const date = new Date(iso + 'T00:00:00');
    return date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  newUhrzeitVon = '18:00';
  newUhrzeitBis = '23:00';

  addUhrzeit(): void {
    if (!this.newUhrzeitVon || !this.newUhrzeitBis) return;
    this.settings.ausstehendUhrzeiten = [
      ...this.settings.ausstehendUhrzeiten,
      { von: this.newUhrzeitVon, bis: this.newUhrzeitBis }
    ];
    this.newUhrzeitVon = '18:00';
    this.newUhrzeitBis = '23:00';
  }

  removeUhrzeit(i: number): void {
    this.settings.ausstehendUhrzeiten =
      this.settings.ausstehendUhrzeiten.filter((_, idx) => idx !== i);
  }

  // ─── Pflichtfelder ───────────────────────────────────────────────────────────
  readonly alleFelder = [
    { key: 'name',      label: 'Name',          icon: 'person'      },
    { key: 'vorname',   label: 'Vorname',        icon: 'badge'       },
    { key: 'email',     label: 'E-Mail',         icon: 'mail'        },
    { key: 'phone',     label: 'Telefon',        icon: 'call'        },
    { key: 'partySize', label: 'Personenanzahl', icon: 'group'       },
    { key: 'notes',     label: 'Notiz',          icon: 'notes'       },
    { key: 'anlass',    label: 'Anlass',         icon: 'celebration' },
  ];

  isPflichtfeld(key: string): boolean {
    return this.settings.pflichtfelder.includes(key);
  }

  togglePflichtfeld(key: string): void {
    this.settings.pflichtfelder = this.isPflichtfeld(key)
      ? this.settings.pflichtfelder.filter(k => k !== key)
      : [...this.settings.pflichtfelder, key];
  }

  // ─── PDF Upload ──────────────────────────────────────────────────────────────
  onPdfSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.settings.speisekartePdfName = file.name;
    const reader = new FileReader();
    reader.onload = () => { this.settings.speisekarteUrl = reader.result as string; };
    reader.readAsDataURL(file);
  }

  removePdf(): void {
    this.settings.speisekartePdfName = '';
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  maxPersonenPreviewText = computed(() =>
    this.settings.maxPersonenText.replace('{{max}}', String(this.settings.maxPersonen))
  );

  stepUp(field: 'kinderStuehleGesamt' | 'kinderStuehleOnline' | 'mindestvorlaufMinuten' | 'vorausbuchungWert' | 'onlineAenderungenMinuten' | 'onlineStornierungMinuten', step = 1): void {
    (this.settings as any)[field] += step;
  }

  stepDown(field: 'kinderStuehleGesamt' | 'kinderStuehleOnline' | 'mindestvorlaufMinuten' | 'vorausbuchungWert' | 'onlineAenderungenMinuten' | 'onlineStornierungMinuten', step = 1, min = 0): void {
    const val = (this.settings as any)[field] - step;
    (this.settings as any)[field] = val < min ? min : val;
  }

  formatMinuten(min: number): string {
    if (min < 60) return `${min} Min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h} Std` : `${h} Std ${m} Min`;
  }
}
