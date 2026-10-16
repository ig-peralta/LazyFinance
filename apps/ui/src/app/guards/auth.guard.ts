import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../services/session/session.service';

export const authGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  return session.active() ? true : inject(Router).createUrlTree(['/login']);
};
