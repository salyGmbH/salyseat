import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './layout/admin-layout/admin-layout.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { StatistikenComponent } from './pages/statistiken/statistiken.component';
import { EinstellungenComponent } from './pages/einstellungen/einstellungen.component';
import { RestaurantPlanComponent } from './pages/restaurant-plan/restaurant-plan.component';

export const routes: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'restaurant-plan', component: RestaurantPlanComponent },
      { path: 'statistiken', component: StatistikenComponent },
      { path: 'einstellungen', component: EinstellungenComponent },
      { path: '**', redirectTo: 'dashboard' },
    ]
  }
];
