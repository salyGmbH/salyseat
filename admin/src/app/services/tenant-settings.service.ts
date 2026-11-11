import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, tap, throwError } from 'rxjs';
import { StatusColor } from './status-colors.service';

export interface ConfigItem {
  key: string;
  label: string;
  color: string;
  icon?: string;
}

// ─── Widget-Design-Typen ───────────────────────────────────────────────────────

export type WidgetLayoutMode  = 'card' | 'sidebar' | 'stacked' | 'planner';
export type TextAlignment     = 'left' | 'center' | 'right';
export type FontFamilyKey     = 'system' | 'modern' | 'classic' | 'serif' | 'rounded' | 'mono';
export type FontSizeKey       = 'compact' | 'standard' | 'large';
export type CornerRadiusKey   = 'square' | 'soft' | 'pill';

export type PageBackgroundType = 'color' | 'image';

export interface PageBackground {
  type:  PageBackgroundType;
  /** Hex-Farbe (type=color) oder Upload-URL (type=image). */
  value: string;
}

export interface WidgetDesignSettings {
  layout:           WidgetLayoutMode;
  /** Data-URL oder null. Ersetzt durch echten Upload-Endpoint, sobald verfügbar. */
  imageUrl:         string | null;
  headingTitle:     string;
  headingSubtitle:  string;
  headingAlignment: TextAlignment;
  showSubtitle:     boolean;
  fontFamily:       FontFamilyKey;
  fontSize:         FontSizeKey;
  colorPrimary:     string;
  colorText:        string;
  colorBackground:  string;
  /** Hintergrundfarbe der Widget-Kachel (unabhängig von colorBackground). */
  cardBackground:   string;
  /** Hintergrund des gesamten Seiten-Body: Farbe oder Bild. */
  pageBackground:   PageBackground;
  buttonLabel:      string;
  cornerRadius:     CornerRadiusKey;
}

export const DEFAULT_WIDGET_DESIGN: WidgetDesignSettings = {
  layout:           'card',
  imageUrl:         null,
  headingTitle:     'Tisch reservieren',
  headingSubtitle:  'bei Restaurant',
  headingAlignment: 'center',
  showSubtitle:     true,
  fontFamily:       'system',
  fontSize:         'standard',
  colorPrimary:     '#2563eb',
  colorText:        '#1f2937',
  colorBackground:  '#ffffff',
  cardBackground:   '#ffffff',
  pageBackground:   { type: 'color', value: '#f4f5f7' },
  buttonLabel:      'Reservieren',
  cornerRadius:     'soft',
};

// ─── Tenant-UI-Settings ───────────────────────────────────────────────────────

export interface TenantUiSettings {
  /** Wird vom Backend automatisch mitgeliefert — nie manuell setzen. */
  _publicKey?: string;
  statuses?: StatusColor[];
  statusView?: 'card' | 'text' | 'svg';
  hinweise?: ConfigItem[];
  hinweisView?: 'text' | 'svg';
  gasttypen?: ConfigItem[];
  gastView?: 'text' | 'svg';
  /** Liste der vom Restaurant ausgewählten Allergene + persönliche Farb-/Icon-Wahl. */
  allergene?: ConfigItem[];
  allergenView?: 'text' | 'svg';
  sortMode?: 'status' | 'time' | 'combined';

  /**
   * Timing-Defaults für Reservierungen — werden vom Restaurant in
   * Einstellungen → Reservierungen gepflegt und sowohl in der Admin
   * (Auto-Status-Wechsel auf "Zeit abgelaufen") als auch im Widget
   * (Slot-Verfügbarkeitsprüfung) verwendet.
   */
  reservationTiming?: ReservationTimingSettings;

  /** Optisches Erscheinungsbild des Buchungs-Widgets. */
  widgetDesign?: WidgetDesignSettings;

  /** Funktionale Widget-Einstellungen (Intervall, Räume, Pflichtfelder usw.). */
  widgetFunctional?: WidgetFunctionalSettings;

  /** Rollen-Berechtigungsmatrix: role → permissionKey → boolean */
  permissions?: Record<string, Record<string, boolean>>;

  /** Gespeicherte Speisekarte-Konfiguration (Design + Inhalte). */
  speisekarteKonfiguration?: {
    design: {
      bgColor:      string;
      bgImage:      string | null;
      textColor:    string;
      accentColor:  string;
      fontFamilyKey: string;
    };
    sections: any[];
  };

  /** Getränke-Reminder Einstellungen (tenant-weit) */
  getraenkeReminder?: { enabled: boolean; minutes: number };

  /**
   * Automatische Gast-Sperrung nach N No-Shows.
   * null / undefined = Funktion deaktiviert.
   */
  noShowAutoBlockThreshold?: number | null;

  /**
   * Ab wie vielen Reservierungen gilt ein Gast als VIP?
   * Standard: 5. Kann in Einstellungen → Kunden/CRM geändert werden.
   */
  vipThreshold?: number;

  /**
   * Restaurant-Logo (hell + dunkel).
   * Gespeichert als relativer Pfad /uploads/…
   */
  logoLight?: string | null;
  logoDark?:  string | null;

  /** Gespeicherte Packages (Menü-Angebote, Events, Feiern …). */
  packages?: any[];

  /**
   * JWT-Laufzeit in Sekunden. Steuert wie lange ein Admin eingeloggt bleibt.
   * Standard: 3600 (1 Stunde). Wird beim nächsten Login aktiv.
   */
  sessionTtlSeconds?: number;

  /** E-Mail-Einstellungen (Aktivierung, Design, Inhalte, Social). */
  emailSettings?: {
    mailSettings?:  { key: string; enabled: boolean }[];
    reminderTime?:  '3min' | '2h' | '24h';
    language?:      'de' | 'en' | 'it';
    design?: {
      mode?:            'dark' | 'light';
      primaryColor?:    string;
      highlightColor?:  string;
      backgroundColor?: string;
      cardColor?:       string;
      borderRadius?:    number;
      fontFamily?:      string;
    };
    content?: Record<string, { footerText: string; infoText: string; signature: string }>;
    social?:  { instagram: string; facebook: string; tiktok: string };
    attachments?: { url: string; name: string; assignedMails: Record<string, boolean> }[];
  };
}

// ─── Widget-Functional-Typen ──────────────────────────────────────────────────

export interface WidgetFunctionalSettings {
  /** Zeitraster in Minuten (15 | 30 | 45 | 60 | 75 | 90 | 105). */
  intervall: number;
  /** Speisekarte im Widget anzeigen? */
  speisekarte: boolean;
  speisekarteType: 'url' | 'pdf';
  speisekarteUrl: string;
  speisekartePdfName: string;
  /** Package-Buchung aktivieren? */
  packageBuchung: boolean;
  /** Buchungen zunächst als „ausstehend" anlegen? */
  ausstehendBestaetigung: boolean;
  ausstehendScope: 'immer' | 'tage';
  ausstehendDaten: string[];
  ausstehendUhrzeitAktiv: boolean;
  ausstehendUhrzeiten: { von: string; bis: string }[];
  /** Welche Räume sollen im Widget buchbar sein? */
  raumauswahl: boolean;
  raumauswahlAktiveIds: string[];
  /** Hinweistext über dem Formular. */
  hinweistext: boolean;
  hinweistextUeberschrift: string;
  hinweistextInhalt: string;
  hinweistextFooter: string;
  /** Welche Felder sind Pflicht im Buchungsformular? */
  pflichtfelder: string[];
  /** Ab dieser Personenzahl → Kontaktformular statt direkter Buchung. */
  maxPersonen: number;
  maxPersonenText: string;
  maxPersonenPhone: string;
  maxPersonenEmail: string;
  /** Kinderstühle */
  kinderStuehleAktiv: boolean;
  kinderStuehleGesamt: number;
  kinderStuehleOnline: number;
  /** Rollstuhl */
  rollstuhlAktiv: boolean;
  /** Hund */
  hundAktiv: boolean;
  /** Allergene-Abfrage im Widget */
  allergeneAktiv: boolean;
  /** Vorausbuchungszeitraum */
  vorausbuchungEinheit: 'tage' | 'monate';
  vorausbuchungWert: number;
  /** Mindestvorlaufzeit in Minuten */
  mindestvorlaufMinuten: number;
  /** Tischarten */
  tischartenAktiv: boolean;
  tischartenAktiveTypes: string[];
  /**
   * Modus, wie der Gast die Tisch-/Sitzplatzwahl im Widget vornimmt:
   *  - 'liste'  → Auswahl der Tischarten wie bisher (rund / eckig / lang)
   *  - 'plan'   → 1:1-Abbild des Restaurantplans, der Gast klickt einen Tisch an
   *
   * Wenn `tischartenAktiv` aus ist, weist das System automatisch einen passenden
   * Tisch zu (Personenzahl, Verfügbarkeit, Raum-Auswahl). Daher gibt es keinen
   * separaten „Auto"-Modus mehr.
   *
   * Die Liste der online buchbaren Räume kommt aus `raumauswahlAktiveIds`
   * (siehe Block „Raumauswahl"). Räume, die dort deaktiviert sind, sind
   * im Widget nicht buchbar (z. B. Terrasse nur für Walk-Ins).
   */
  tischartenAuswahlModus: 'liste' | 'plan';
  /** Online Änderungen */
  onlineAenderungen: boolean;
  onlineAenderungenMinuten: number;
  /** Online Stornierung */
  onlineStornierung: boolean;
  onlineStornierungMinuten: number;
  /** Warteliste */
  wartelisteAktiv: boolean;
  wartelisteMaxPlaetze: number;
  wartelisteKanal: 'email' | 'telefon' | 'beide';
  wartelisteAntwortStunden: number;
  wartelisteHinweis: string;
}

export const DEFAULT_WIDGET_FUNCTIONAL: WidgetFunctionalSettings = {
  intervall:                30,
  speisekarte:              false,
  speisekarteType:          'url',
  speisekarteUrl:           '',
  speisekartePdfName:       '',
  packageBuchung:           false,
  ausstehendBestaetigung:   false,
  ausstehendScope:          'immer',
  ausstehendDaten:          [],
  ausstehendUhrzeitAktiv:   false,
  ausstehendUhrzeiten:      [],
  raumauswahl:              false,
  raumauswahlAktiveIds:     [],
  hinweistext:              false,
  hinweistextUeberschrift:  '',
  hinweistextInhalt:        '',
  hinweistextFooter:        '',
  pflichtfelder:            ['name', 'partySize'],
  maxPersonen:              8,
  maxPersonenText:          'Für größere Gruppen bitten wir um Kontaktaufnahme.',
  maxPersonenPhone:         '',
  maxPersonenEmail:         '',
  kinderStuehleAktiv:       false,
  kinderStuehleGesamt:      4,
  kinderStuehleOnline:      2,
  rollstuhlAktiv:           false,
  hundAktiv:                false,
  allergeneAktiv:           false,
  vorausbuchungEinheit:     'monate',
  vorausbuchungWert:        12,
  mindestvorlaufMinuten:    60,
  tischartenAktiv:          false,
  tischartenAktiveTypes:    ['round', 'square', 'long'],
  tischartenAuswahlModus:   'liste',
  onlineAenderungen:        false,
  onlineAenderungenMinuten: 120,
  onlineStornierung:        false,
  onlineStornierungMinuten: 120,
  wartelisteAktiv:          false,
  wartelisteMaxPlaetze:     3,
  wartelisteKanal:          'email',
  wartelisteAntwortStunden: 24,
  wartelisteHinweis:        '',
};

export interface ReservationTimingSettings {
  /** Standard-Reservierungsdauer in Minuten (z. B. 120 = 2h). */
  defaultDurationMinutes: number;
  /**
   * Wenn true, wechselt der Status automatisch auf "expired", sobald
   * die Reservierungsdauer abgelaufen ist (Status zuvor: seated).
   */
  autoExpireEnabled: boolean;
  /** Clean-up-Zeit zwischen zwei Buchungen aktiv? */
  cleanupEnabled: boolean;
  /** Dauer der Clean-up-Zeit in Minuten (nur relevant wenn enabled). */
  cleanupMinutes: number;
}

export const DEFAULT_RESERVATION_TIMING: ReservationTimingSettings = {
  defaultDurationMinutes: 120,
  autoExpireEnabled:      true,
  cleanupEnabled:         false,
  cleanupMinutes:         15,
};

@Injectable({ providedIn: 'root' })
export class TenantSettingsService {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/v1/admin/tenant/settings';

  /** Zentraler Snapshot — wird nach jedem load() und save() aktualisiert. */
  snapshot: TenantUiSettings = {};

  /** Public Key des Tenants — wird vom Backend beim GET mitgeliefert. */
  readonly publicKey = signal<string>('');

  load(): Observable<TenantUiSettings> {
    return this.http.get<TenantUiSettings>(this.url).pipe(
      tap(s => {
        this.snapshot = s;
        if (s._publicKey) this.publicKey.set(s._publicKey);
      }),
      catchError(() => of({} as TenantUiSettings))
    );
  }

  save(settings: TenantUiSettings): Observable<TenantUiSettings> {
    // _publicKey nie ans Backend schicken — ist read-only und serverseitig gesetzt.
    const { _publicKey, ...payload } = settings;
    return this.http.put<TenantUiSettings>(this.url, payload).pipe(
      tap(s => {
        this.snapshot = s;
        if (s._publicKey) this.publicKey.set(s._publicKey);
      }),
      catchError((err) => throwError(() => err))
    );
  }
}
