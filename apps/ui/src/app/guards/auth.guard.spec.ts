import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { firstValueFrom, type Observable } from 'rxjs';
import { SessionService } from '../services/session/session.service';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  afterEach(() => TestBed.resetTestingModule());

  function activate(active: boolean) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { active: () => active, isResolving: () => false } },
      ],
    });
    return TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/dashboard' } as RouterStateSnapshot),
    );
  }

  it('allows an active session', () => {
    expect(activate(true)).toBe(true);
  });

  it('redirects visitors without a session to login', () => {
    const redirect = activate(false) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(redirect)).toBe('/login?redirect=%2Fdashboard');
  });

  it('waits for Firebase restoration before deciding a protected route', async () => {
    const resolving = signal(true);
    const active = signal(false);
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: SessionService, useValue: { active, isResolving: resolving } },
    ] });
    const decision = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/dashboard' } as RouterStateSnapshot),
    ) as Observable<boolean | UrlTree>;
    const result = firstValueFrom(decision);
    active.set(true);
    resolving.set(false);
    await expect(result).resolves.toBe(true);
  });
});
