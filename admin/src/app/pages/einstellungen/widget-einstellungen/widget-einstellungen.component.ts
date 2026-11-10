import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take, forkJoin, of } from 'rxjs';
import { VenueService } from '../../../services/venue.service';
import { RoomsService } from '../../../services/rooms.service';
import { WidgetFunctionalService } from '../../../services/widget-functional.service';
import { PlacedTable, PlacedWall, PlacedDecor, TableType } from '../../../services/room.types';

@Component({
  selector: 'app-widget-einstellungen',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, TranslateModule],
  templateUrl: './widget-einstellungen.component.html',
  styleUrl: './widget-einstellungen.component.scss'
})
export class WidgetEinstellungenComponent implements OnInit {

  private readonly venueService        = inject(VenueService);
  private readonly roomsService        = inject(RoomsService);
  private readonly widgetFunctionalSvc = inject(WidgetFunctionalService);
  private readonly translate           = inject(TranslateService);

  constructor() {
    toObservable(this.widgetFunctionalSvc.isLoaded)
      .pipe(filter(loaded => loaded), take(1))
      .subscribe(() => {
        Object.assign(this.settings, this.widgetFunctionalSvc.settings());
        this.initRaumauswahl();
        this.loadAlleLayouts();
      });
  }

  // ─── Info-Toggles ────────────────────────────────────────────────────────────
  info1  = signal(false); info2  = signal(false); info3  = signal(false);
  info4  = signal(false); info5  = signal(false); info6  = signal(false);
  info7  = signal(false); info8  = signal(false); info9  = signal(false);
  info10 = signal(false); info11 = signal(false); info12 = signal(false);
  info13 = signal(false); info14 = signal(false); info15 = signal(false);
  info16 = signal(false);

  // ─── Per-Block saved signals ─────────────────────────────────────────────────
  saved1  = signal(false); saved2  = signal(false); saved3  = signal(false);
  saved4  = signal(false); saved5  = signal(false); saved6  = signal(false);
  saved7  = signal(false); saved8  = signal(false); saved9  = signal(false);
  saved10 = signal(false); saved11 = signal(false); saved12 = signal(false);
  saved13 = signal(false); saved14 = signal(false); saved15 = signal(false);
  saved16 = signal(false);

  saveBlock(n: number): void {
    const all = [
      this.saved1, this.saved2, this.saved3, this.saved4, this.saved5,
      this.saved6, this.saved7, this.saved8, this.saved9, this.saved10,
      this.saved11, this.saved12, this.saved13, this.saved14, this.saved15,
      this.saved16
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

    // 9. Kinderstühle / Rollstuhl / Hund
    kinderStuehleAktiv: false,
    kinderStuehleGesamt: 4,
    kinderStuehleOnline: 2,
    rollstuhlAktiv: false,
    hundAktiv: false,

    // 16. Allergene
    allergeneAktiv: false,

    // 10. Vorausbuchung
    vorausbuchungEinheit: 'monate' as 'tage' | 'monate',
    vorausbuchungWert: 12,

    // 11. Mindestvorlaufzeit
    mindestvorlaufMinuten: 60,

    // 12. Tischarten
    tischartenAktiv: false,
    tischartenAktiveTypes: ['round', 'square', 'long'] as string[],
    tischartenAuswahlModus: 'liste' as 'liste' | 'plan',

    // 13. Online Änderungen
    onlineAenderungen: false,
    onlineAenderungenMinuten: 120,

    // 14. Online Stornierung
    onlineStornierung: false,
    onlineStornierungMinuten: 120,

    // 15. Warteliste
    wartelisteAktiv: false,
    wartelisteMaxPlaetze: 3,
    wartelisteKanal: 'email' as 'email' | 'telefon' | 'beide',
    wartelisteAntwortStunden: 24,
    wartelisteHinweis: '',
  };

  // ─── Räume ───────────────────────────────────────────────────────────────────
  readonly venues = this.venueService.venues;

  ngOnInit(): void {
    if (!this.venueService.loaded()) {
      this.venueService.load().subscribe(() => {
        this.initRaumauswahl();
        this.loadAlleLayouts();
      });
    } else {
      this.initRaumauswahl();
      this.loadAlleLayouts();
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
    { key: 'round',  label: 'widget_einstellungen.table_round',  icon: 'circle',      shape: 'round'  },
    { key: 'square', label: 'widget_einstellungen.table_square', icon: 'crop_square', shape: 'square' },
    { key: 'long',   label: 'widget_einstellungen.table_long',   icon: 'table_rows',  shape: 'long'   },
  ];

  /** Nur Tischarten anzeigen, die in den aktiven Räumen auch wirklich vorhanden sind. */
  get verfuegbareTischarten() {
    const layouts   = this._layouts();
    const activeIds = this.settings.raumauswahlAktiveIds;
    const ids       = activeIds.length > 0 ? activeIds : Object.keys(layouts);
    const types     = new Set<string>(
      ids.flatMap(id => (layouts[id]?.tables ?? []).map(t => t.type as string))
    );
    return types.size > 0
      ? this.alleTischarten.filter(t => types.has(t.key))
      : this.alleTischarten; // Fallback solange Layouts noch laden
  }

  isTischartenAktiv(key: string): boolean {
    return this.settings.tischartenAktiveTypes.includes(key);
  }

  toggleTischart(key: string): void {
    this.settings.tischartenAktiveTypes = this.isTischartenAktiv(key)
      ? this.settings.tischartenAktiveTypes.filter(k => k !== key)
      : [...this.settings.tischartenAktiveTypes, key];
  }

  // ─── Tischarten Auswahl-Modus (Liste / Plan) ─────────────────────────────────
  // Hinweis: Wenn der Master-Toggle (tischartenAktiv) aus ist, weist das System
  // den Tisch automatisch zu — daher gibt es keinen separaten „Auto"-Modus.
  readonly auswahlModi = [
    { key: 'liste' as const, icon: 'view_list', label: 'widget_einstellungen.mode_list', desc: 'widget_einstellungen.mode_list_desc' },
    { key: 'plan'  as const, icon: 'map',       label: 'widget_einstellungen.mode_plan', desc: 'widget_einstellungen.mode_plan_desc' },
  ];

  setAuswahlModus(mode: 'liste' | 'plan'): void {
    this.settings.tischartenAuswahlModus = mode;
  }

  // ─── Plan-Preview (Restaurantplan-Vorschau) ──────────────────────────────────
  readonly _layouts = signal<Record<string, { tables: PlacedTable[]; walls: PlacedWall[]; decors: PlacedDecor[] }>>({});
  readonly previewSelectedRoomId = signal<string | null>(null);
  readonly previewSelectedTableId = signal<number | null>(null);

  /** Lädt die Layouts (Tische/Wände/Deko) aller Venues für die Vorschau. */
  private loadAlleLayouts(): void {
    const venues = this.venues();
    if (!venues.length) return;
    const calls = venues.map(v => this.roomsService.loadRoomLayout(v.id));
    forkJoin(calls.length ? calls : [of(null)]).subscribe(results => {
      const map: Record<string, { tables: PlacedTable[]; walls: PlacedWall[]; decors: PlacedDecor[] }> = {};
      venues.forEach((v, i) => {
        const r = results[i] as any;
        map[v.id] = {
          tables: r?.tables ?? [],
          walls:  r?.walls  ?? [],
          decors: r?.decors ?? [],
        };
      });
      this._layouts.set(map);
      // Ersten aktiven Raum (aus Block 5) als Vorschau auswählen.
      const first = venues.find(v => this.isRaumAktiv(v.id)) ?? venues[0];
      if (first && !this.previewSelectedRoomId()) this.previewSelectedRoomId.set(first.id);
    });
  }

  /** Aktuell in der Vorschau dargestellter Raum. */
  readonly previewRoom = computed<{ id: string; name: string; tables: PlacedTable[]; walls: PlacedWall[]; decors: PlacedDecor[] } | null>(() => {
    const id = this.previewSelectedRoomId();
    if (!id) return null;
    const v = this.venues().find(x => x.id === id);
    if (!v) return null;
    const layout = this._layouts()[id] ?? { tables: [], walls: [], decors: [] };
    return { id: v.id, name: v.name, ...layout };
  });

  selectPreviewRoom(id: string): void {
    this.previewSelectedRoomId.set(id);
    this.previewSelectedTableId.set(null);
  }

  selectPreviewTable(id: number): void {
    this.previewSelectedTableId.set(this.previewSelectedTableId() === id ? null : id);
  }

  /**
   * Räume, die im Plan-Modus dargestellt werden — kommt direkt aus dem
   * zentralen Raumauswahl-Setting (Block 5). So gibt es nur eine einzige
   * Quelle der Wahrheit, welche Räume online buchbar sind.
   */
  readonly aktivePlanRaeume = computed(() =>
    this.venues().filter(v => this.isRaumAktiv(v.id))
  );

  // ─── Tisch-Geometrie (für die Mini-Vorschau des Restaurantplans) ────────────
  getTableSize(type: TableType): { w: number; h: number } {
    return type === 'long' ? { w: 140, h: 70 } : { w: 70, h: 70 };
  }

  getDecorSize(type: string): { w: number; h: number } {
    if (type === 'bar' || type === 'stage' || type === 'sofa') return { w: 140, h: 70 };
    if (type === 'window') return { w: 140, h: 32 };
    return { w: 70, h: 70 };
  }

  getSeatPositions(count: number): Array<{ x: number; y: number }> {
    return Array.from({ length: count }, (_, i) => {
      const a = (2 * Math.PI * i / count) - Math.PI / 2;
      return { x: +(35 + 31 * Math.cos(a)).toFixed(1), y: +(35 + 31 * Math.sin(a)).toFixed(1) };
    });
  }

  getLongTableSeatPositions(count: number): Array<{ x: number; y: number }> {
    const tableLeft = 8, tableRight = 132;
    const w = tableRight - tableLeft;
    const topCount    = Math.ceil(count / 2);
    const bottomCount = Math.floor(count / 2);
    const positions: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < topCount; i++)
      positions.push({ x: +(tableLeft + w / (topCount + 1) * (i + 1)).toFixed(1), y: 5 });
    for (let i = 0; i < bottomCount; i++)
      positions.push({ x: +(tableLeft + w / (bottomCount + 1) * (i + 1)).toFixed(1), y: 65 });
    return positions;
  }

  /** Bounding-Box aller Elemente eines Raums – für den viewBox des Plan-SVGs. */
  getRoomBounds(room: { tables: PlacedTable[]; walls: PlacedWall[]; decors: PlacedDecor[] } | null): { x: number; y: number; w: number; h: number } {
    if (!room) return { x: 0, y: 0, w: 800, h: 500 };
    const points: Array<{ x: number; y: number; w: number; h: number }> = [];
    room.tables.forEach(t => {
      const sz = this.getTableSize(t.type);
      points.push({ x: t.x, y: t.y, w: sz.w * t.scale, h: sz.h * t.scale });
    });
    room.walls.forEach(w => {
      points.push({ x: w.x - w.length / 2, y: w.y - 8, w: w.length, h: 16 });
    });
    room.decors.forEach(d => {
      const sz = this.getDecorSize(d.type);
      points.push({ x: d.x, y: d.y, w: sz.w * d.scale, h: sz.h * d.scale });
    });
    if (!points.length) return { x: 0, y: 0, w: 800, h: 500 };
    const minX = Math.min(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxX = Math.max(...points.map(p => p.x + p.w));
    const maxY = Math.max(...points.map(p => p.y + p.h));
    const padX = 25, padY = 25;
    return {
      x: minX - padX,
      y: minY - padY,
      w: Math.max(300, maxX - minX + padX * 2),
      h: Math.max(200, maxY - minY + padY * 2),
    };
  }

  previewViewBox = computed<string>(() => {
    const b = this.getRoomBounds(this.previewRoom());
    return `${b.x} ${b.y} ${b.w} ${b.h}`;
  });

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
    { key: 'name',      label: 'widget_einstellungen.field_name',      icon: 'person'      },
    { key: 'vorname',   label: 'widget_einstellungen.field_vorname',   icon: 'badge'       },
    { key: 'email',     label: 'widget_einstellungen.field_email',     icon: 'mail'        },
    { key: 'phone',     label: 'widget_einstellungen.field_phone',     icon: 'call'        },
    { key: 'partySize', label: 'widget_einstellungen.field_partySize', icon: 'group'       },
    { key: 'notes',     label: 'widget_einstellungen.field_notes',     icon: 'notes'       },
    { key: 'anlass',    label: 'widget_einstellungen.field_anlass',    icon: 'celebration' },
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

  stepUp(field: 'kinderStuehleGesamt' | 'kinderStuehleOnline' | 'mindestvorlaufMinuten' | 'vorausbuchungWert' | 'onlineAenderungenMinuten' | 'onlineStornierungMinuten' | 'wartelisteMaxPlaetze' | 'wartelisteAntwortStunden', step = 1): void {
    (this.settings as any)[field] += step;
  }

  stepDown(field: 'kinderStuehleGesamt' | 'kinderStuehleOnline' | 'mindestvorlaufMinuten' | 'vorausbuchungWert' | 'onlineAenderungenMinuten' | 'onlineStornierungMinuten' | 'wartelisteMaxPlaetze' | 'wartelisteAntwortStunden', step = 1, min = 0): void {
    const val = (this.settings as any)[field] - step;
    (this.settings as any)[field] = val < min ? min : val;
  }

  formatMinuten(min: number): string {
    const minLabel = this.translate.instant('widget_einstellungen.min');
    const stdLabel = this.translate.instant('widget_einstellungen.hours');
    if (min < 60) return `${min} ${minLabel}`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h} ${stdLabel}` : `${h} ${stdLabel} ${m} ${minLabel}`;
  }
}
