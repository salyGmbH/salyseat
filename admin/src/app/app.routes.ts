import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './layout/admin-layout/admin-layout.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { StatistikenComponent } from './pages/statistiken/statistiken.component';
import { RestaurantPlanComponent } from './pages/restaurant-plan/restaurant-plan.component';
import { RaumComponent } from './pages/raum/raum.component';
import { RaumDetailComponent } from './pages/raum-detail/raum-detail.component';
import { LoginComponent } from './pages/login/login.component';
import { authGuard, guestGuard } from './services/auth.guard';

export const routes: Routes = [
  // Login liegt außerhalb des Admin-Layouts (keine Sidebar)
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },

  {
    path: '',
    component: AdminLayoutComponent,
    // Alles im Admin-Bereich nur mit gültigem Login – sonst Weiterleitung auf /login
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'raum', component: RaumComponent },
      { path: 'raum/:id', component: RaumDetailComponent },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'restaurant-plan', component: RestaurantPlanComponent },
      { path: 'restaurant-plan/:id', component: RestaurantPlanComponent },
      { path: 'statistiken', component: StatistikenComponent },
      {
        path: 'einstellungen',
        // Unterseiten (allgemein, widget, sicherheit, …) stehen in einstellungen.routes.ts
        loadChildren: () =>
          import('./pages/einstellungen/einstellungen.routes').then(m => m.EINSTELLUNGEN_ROUTES),
      },
      { path: '**', redirectTo: 'dashboard' },
    ]
  }
];
