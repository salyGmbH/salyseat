import { Routes } from '@angular/router';
import { StartComponent } from './pages/start/start.component';

export const routes: Routes = [
  { path: '', component: StartComponent, pathMatch: 'full' },
  // Platzhalter für spätere Schritte des Buchungsflows:
  // { path: 'datum',     loadComponent: () => import('./pages/datum/datum.component').then(m => m.DatumComponent) },
  // { path: 'kontakt',   loadComponent: () => import('./pages/kontakt/kontakt.component').then(m => m.KontaktComponent) },
  // { path: 'bestaetigung', loadComponent: () => import('./pages/bestaetigung/bestaetigung.component').then(m => m.BestaetigungComponent) },
  { path: '**', redirectTo: '' },
];
