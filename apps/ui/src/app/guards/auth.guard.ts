import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { SessionService } from '../services/session/session.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const check = () => session.active() ? true : router.createUrlTree(['/login'], {
    queryParams: { redirect: state.url },
  });
  if (!session.isResolving()) return check();
  return toObservable(session.isResolving).pipe(
    filter((resolving) => !resolving),
    take(1),
    map(() => check()),
  );
};
