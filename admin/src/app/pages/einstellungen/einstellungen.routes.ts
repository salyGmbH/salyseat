import { Routes } from '@angular/router';
import { EinstellungenComponent } from './einstellungen.component';
import { OverviewComponent } from './overview/overview.component';

import { AllgemeinComponent } from './allgemein/allgemein.component';
import { WidgetComponent } from './widget/widget.component';
import { WidgetEinstellungenComponent } from './widget-einstellungen/widget-einstellungen.component';
import { RestaurantplanComponent } from './restaurantplan/restaurantplan.component';
import { MitarbeiterComponent } from './mitarbeiter/mitarbeiter.component';

import { StatusFarbenComponent } from './status-farben/status-farben.component';

import { PackagesComponent } from './packages/packages.component';
import { ReservierungenComponent } from './reservierungen/reservierungen.component';
import { LoginComponent } from './login/login.component';
import { StatistikenComponent } from './statistiken/statistiken.component';
import { ReservierungslisteComponent } from './reservierungsliste/reservierungsliste.component';
import { SprachenComponent } from './sprachen/sprachen.component';
import { EmailsComponent } from './emails/emails.component';
import { SicherheitComponent } from './sicherheit/sicherheit.component';
import { KreditkarteComponent } from './kreditkarte/kreditkarte.component';
import { HotelAutomatischComponent } from './hotel-automatisch/hotel-automatisch.component';

// 🔥 Neu
import { RechteComponent } from './rechte/rechte.component';
import { NotificationsComponent } from './notifications/notifications.component';
import { OeffnungszeitenComponent } from './oeffnungszeiten/oeffnungszeiten.component';
import { IntegrationenComponent } from './integrationen/integrationen.component';
import { BackupComponent } from './backup/backup.component';
import { BrandingComponent } from './branding/branding.component';
import { KundenComponent } from './kunden/kunden.component';
import { NotizenComponent } from './notizen/notizen.component';

export const EINSTELLUNGEN_ROUTES: Routes = [
  {
    path: '',
    component: EinstellungenComponent,
    children: [
      { path: '', component: OverviewComponent },

      { path: 'allgemein',      component: AllgemeinComponent },
      { path: 'widget',                component: WidgetComponent },
      { path: 'widget-einstellungen', component: WidgetEinstellungenComponent },
      { path: 'restaurantplan', component: RestaurantplanComponent },
      { path: 'mitarbeiter',    component: MitarbeiterComponent },

      // Rollen & feingranulare Berechtigungen
      { path: 'rechte',         component: RechteComponent },

      { path: 'status-kennzeichnungen', component: StatusFarbenComponent },

      { path: 'packages',          component: PackagesComponent },
      { path: 'reservierungen',    component: ReservierungenComponent },
      { path: 'login',             component: LoginComponent },
      { path: 'statistiken',       component: StatistikenComponent },
      { path: 'reservierungsliste', component: ReservierungslisteComponent },
      { path: 'sprachen',          component: SprachenComponent },
      { path: 'emails',            component: EmailsComponent },
      { path: 'sicherheit',        component: SicherheitComponent },
      { path: 'kreditkarte',       component: KreditkarteComponent },
      { path: 'hotel-automatisch', component: HotelAutomatischComponent },

      // Neue Bereiche
      { path: 'notifications',   component: NotificationsComponent },
      { path: 'oeffnungszeiten', component: OeffnungszeitenComponent },
      { path: 'integrationen',   component: IntegrationenComponent },
      { path: 'backup',          component: BackupComponent },
      { path: 'branding',        component: BrandingComponent },
      { path: 'kunden',          component: KundenComponent },
      { path: 'notizen',         component: NotizenComponent },
    ]
  }
];
