import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './layout/admin-layout/admin-layout.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { StatistikenComponent } from './pages/statistiken/statistiken.component';
import { EinstellungenComponent } from './pages/einstellungen/einstellungen.component';
import { RestaurantPlanComponent } from './pages/restaurant-plan/restaurant-plan.component';
import { RaumComponent } from './pages/raum/raum.component';
import { RaumDetailComponent } from './pages/raum-detail/raum-detail.component';
import { LoginComponent } from './pages/login/login.component';
import { SchichtplanungComponent } from './pages/schichtplanung/schichtplanung.component';
import { GutscheineComponent } from './pages/gutscheine/gutscheine.component';
import { HotelgaesteComponent } from './pages/hotelgaeste/hotelgaeste.component';
import { authGuard, guestGuard, planGuard } from './services/auth.guard';

export const routes: Routes = [
  // Öffentliche Login-Seite — für bereits eingeloggte User auf /dashboard umleiten
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [guestGuard],
  },
  // Alles darunter ist JWT-geschützt
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'raum', component: RaumComponent },
      { path: 'raum/:id', component: RaumDetailComponent },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'restaurant-plan', component: RestaurantPlanComponent },
      { path: 'restaurant-plan/:id', component: RestaurantPlanComponent },
      { path: 'statistiken', component: StatistikenComponent },
      { path: 'schichtplanung', component: SchichtplanungComponent, canActivate: [planGuard('schichtplan')] },
      { path: 'gutscheine', component: GutscheineComponent },
      { path: 'hotelgaeste', component: HotelgaesteComponent },
     {
  path: 'einstellungen',
  loadChildren: () =>
    import('./pages/einstellungen/einstellungen.routes')
      .then(m => m.EINSTELLUNGEN_ROUTES)
},
      { path: '**', redirectTo: 'dashboard' },
    ]
  }
];
