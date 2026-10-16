import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionService } from '../services/session/session.service';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  afterEach(() => TestBed.resetTestingModule());

  function activate(active: boolean) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { active: () => active } },
      ],
    });
    return TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
  }

  it('allows an active session', () => {
    expect(activate(true)).toBe(true);
  });

  it('redirects visitors without a session to login', () => {
    const redirect = activate(false) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(redirect)).toBe('/login');
  });
});
