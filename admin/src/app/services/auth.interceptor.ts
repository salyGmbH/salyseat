import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Hängt das JWT als `Authorization: Bearer ...`-Header an jeden Request
 * an, der ans eigene Backend geht. Fliegt ein 401 zurück, wird die Session
 * geleert und auf die Login-Seite umgeleitet.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const token = auth.token();

  // Login-Request selbst natürlich ohne Bearer schicken.
  const isAuthCall = req.url.includes('/api/v1/auth/login');

  const authReq = token && !isAuthCall
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !isAuthCall) {
        auth.logout();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
