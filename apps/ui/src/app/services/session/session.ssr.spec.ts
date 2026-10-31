import '@angular/compiler';
import { Component, REQUEST, RESPONSE_INIT, inject, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { provideRouter, RouterOutlet } from '@angular/router';
import type { AuthConfig, AuthPrincipal, AuthProvider } from '@lazyfinance/contracts';
import { of, throwError, type Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { authGuard } from '../../guards/auth.guard';
import { ApiService } from '../api/api.service';
import { SessionService } from './session.service';

@Component({ selector: 'session-ssr-root', imports: [RouterOutlet], template: '<router-outlet />' })
class SsrRoot {}

@Component({ template: '<p>PRIVATE_FINANCIAL_DATA</p>' })
class PrivatePage {}

@Component({ template: '<p>LOGIN_REQUIRED</p>' })
class LoginPage {}

describe('Firebase protected SSR', () => {
  async function render(cookie: string, getPrincipal: (token: string) => Observable<AuthPrincipal>, provider: AuthProvider = 'firebase') {
    const request = new Request('http://localhost/dashboard', {
      headers: { cookie: `lazyfinance-session=${encodeURIComponent(cookie)}` },
    });
    return renderApplication((context) => bootstrapApplication(SsrRoot, {
      providers: [
        provideZonelessChangeDetection(),
        provideServerRendering(),
        provideRouter([
          { path: 'dashboard', component: PrivatePage, canActivate: [authGuard] },
          { path: 'login', component: LoginPage },
        ]),
        provideAppInitializer(() => inject(SessionService).initServerSide()),
        { provide: REQUEST, useValue: request },
        { provide: RESPONSE_INIT, useValue: { headers: new Headers() } },
        { provide: ApiService, useValue: {
          getAuthConfig: () => of<AuthConfig>({ provider }), getPrincipal,
        } },
      ],
    }, context), {
      document: '<!doctype html><html><body><session-ssr-root></session-ssr-root></body></html>',
      url: 'http://localhost/dashboard',
      allowedHosts: ['localhost'],
    });
  }

  it('renders financial content only after API validation of the cookie token', async () => {
    const getPrincipal = vi.fn(() => of({ userId: 'owner', email: 'owner@example.com', name: 'Owner' }));
    const html = await render(JSON.stringify({ token: 'signed-token' }), getPrincipal);
    expect(getPrincipal).toHaveBeenCalledExactlyOnceWith('signed-token');
    expect(html).toContain('PRIVATE_FINANCIAL_DATA');
    expect(html).not.toContain('signed-token');
  });

  it('does not render financial content from an expired token or client-supplied user', async () => {
    const getPrincipal = vi.fn(() => throwError(() => new Error('Expired token')));
    const expired = await render(JSON.stringify({ token: 'expired-token' }), getPrincipal);
    expect(expired).not.toContain('PRIVATE_FINANCIAL_DATA');
    expect(getPrincipal).toHaveBeenCalledExactlyOnceWith('expired-token');

    const forged = await render(JSON.stringify({ token: 'signed-token', user: { userId: 'other' } }), getPrincipal);
    expect(forged).not.toContain('PRIVATE_FINANCIAL_DATA');
    expect(getPrincipal).toHaveBeenCalledTimes(1);
  });

  it('requires API verification for the local mock provider too', async () => {
    const getPrincipal = vi.fn(() => throwError(() => new Error('Unknown mock identity')));
    const html = await render(JSON.stringify({ token: 'forged-mock-token' }), getPrincipal, 'mock');
    expect(getPrincipal).toHaveBeenCalledExactlyOnceWith('forged-mock-token');
    expect(html).not.toContain('PRIVATE_FINANCIAL_DATA');
  });
});
