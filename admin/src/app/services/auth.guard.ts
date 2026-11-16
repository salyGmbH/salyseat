import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { PlanFeature, PlanService } from './plan.service';

/**
 * Blockt Zugriff auf geschützte Admin-Routen, solange kein gültiges Token
 * im localStorage liegt. Leitet sonst auf /login um und merkt sich die
 * ursprünglich angefragte URL im queryParam `returnUrl`.
 */
export const authGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};

/**
 * Blockiert Routen die ein bestimmtes Abo-Paket benötigen.
 * Leitet auf /dashboard um wenn der Plan nicht ausreicht.
 */
export const planGuard = (feature: PlanFeature): CanActivateFn =>
  (): boolean | UrlTree => {
    const plan   = inject(PlanService);
    const router = inject(Router);
    return plan.can(feature) ? true : router.createUrlTree(['/dashboard']);
  };

/**
 * Gegenstück: wer bereits eingeloggt ist, soll die Login-Seite nicht sehen,
 * sondern direkt ins Dashboard springen.
 */
export const guestGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/dashboard']);
};
