import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './services/auth.guard';
import { LayoutComponent } from './layout/layout.component';
import { LoginComponent } from './pages/login/login.component';
import { KundenComponent } from './pages/kunden/kunden.component';
import { AddonsComponent } from './pages/addons/addons.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '',         redirectTo: 'kunden', pathMatch: 'full' },
      { path: 'kunden',  component: KundenComponent },
      { path: 'addons',  component: AddonsComponent },
    ],
  },
  { path: '**', redirectTo: 'kunden' },
];
