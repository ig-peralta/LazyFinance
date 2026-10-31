import '@angular/compiler';
import { PLATFORM_ID, REQUEST, RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AuthConfig } from '@lazyfinance/contracts';
import { SsrCookieService } from 'ngx-cookie-service-ssr';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../api/api.service';
import { initializeServices } from '../initializer';
import { SessionService } from './session.service';

const cookieName = 'lazyfinance-session';
const principal = { userId: 'demo-user', email: 'demo@lazyfinance.cl', name: 'Camila Rojas' };
const getPrincipal = vi.fn((_token: string) => of(principal));
const getAuthConfig = vi.fn(() => of<AuthConfig>({ provider: 'mock' }));
const initialize = () => TestBed.runInInjectionContext(initializeServices);

beforeEach(() => {
  getPrincipal.mockReset();
  getPrincipal.mockImplementation(() => of(principal));
  getAuthConfig.mockReset();
  getAuthConfig.mockImplementation(() => of<AuthConfig>({ provider: 'mock' }));
  TestBed.configureTestingModule({
    providers: [{ provide: ApiService, useValue: { getPrincipal, getAuthConfig } }],
  });
});

afterEach(() => {
  document.cookie = `${cookieName}=; Max-Age=0; Path=/`;
  TestBed.resetTestingModule();
});

describe('SessionService', () => {
  it('revalidates the mock token from the incoming SSR request cookie', async () => {
    const token = 'first-user-token';
    const request = new Request('http://localhost:4200/', {
      headers: {
        cookie: `${cookieName}=${encodeURIComponent(JSON.stringify({ token: ` ${token} ` }))}`,
      },
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: REQUEST, useValue: request },
      ],
    });

    const session = TestBed.inject(SessionService);
    expect(session.isResolving()).toBe(true);
    await initialize();
    expect(getPrincipal).toHaveBeenCalledExactlyOnceWith(token);
    expect(session.token()).toBe(token);
    expect(session.user()).toEqual(principal);
    expect(session.active()).toBe(true);
    expect(session.isResolving()).toBe(false);
  });

  it('ignores a malformed mock session cookie during SSR', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        {
          provide: REQUEST,
          useValue: new Request('http://localhost:4200/', {
            headers: { cookie: `${cookieName}=not-json` },
          }),
        },
      ],
    });

    const session = TestBed.inject(SessionService);
    await initialize();
    expect(session.token()).toBeNull();
    expect(session.active()).toBe(false);
    expect(session.isResolving()).toBe(false);
  });

  it('writes a secure session cookie to the SSR response when the request uses HTTPS', async () => {
    const response = { headers: new Headers() };
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: REQUEST, useValue: new Request('https://lazyfinance.example/') },
        { provide: RESPONSE_INIT, useValue: response },
      ],
    });

    const session = TestBed.inject(SessionService);
    await initialize();
    await session.loginWithToken('server-token');

    expect(session.user()).toEqual(principal);
    expect(response.headers.get('Set-Cookie')).toContain(cookieName);
    expect(response.headers.get('Set-Cookie')).toContain('Path=/');
    expect(response.headers.get('Set-Cookie')).toContain('Secure');
    expect(response.headers.get('Set-Cookie')).toContain('SameSite=Lax');
  });

  it('restores a mock browser session after reload', async () => {
    document.cookie = `${cookieName}=${encodeURIComponent(JSON.stringify({ token: 'saved-token' }))}; Path=/`;
    const session = TestBed.inject(SessionService);

    await initialize();
    expect(getPrincipal).toHaveBeenCalledExactlyOnceWith('saved-token');

    expect(session.token()).toBe('saved-token');
    expect(session.user()).toEqual(principal);
    expect(session.active()).toBe(true);
  });

  it('rejects a client-supplied mock principal rather than trusting it', async () => {
    document.cookie = `${cookieName}=${encodeURIComponent(JSON.stringify({ token: 'demo-token', user: principal }))}; Path=/`;
    const session = TestBed.inject(SessionService);

    await initialize();

    expect(session.active()).toBe(false);
    expect(session.token()).toBeNull();
    expect(document.cookie).not.toContain(cookieName);
    expect(getPrincipal).not.toHaveBeenCalled();
  });

  it('logs in only after the API returns a principal, then persists and clears the session', async () => {
    const session = TestBed.inject(SessionService);
    await initialize();
    await session.loginWithToken('  demo-token  ');

    expect(getPrincipal).toHaveBeenCalledWith('demo-token');
    expect(session.token()).toBe('demo-token');
    expect(session.user()).toEqual(principal);
    expect(session.active()).toBe(true);
    expect(document.cookie).toContain(cookieName);
    expect(JSON.parse(TestBed.inject(SsrCookieService).get(cookieName))).toEqual({ token: 'demo-token' });

    session.clear();
    expect(session.token()).toBeNull();
    expect(session.user()).toBeNull();
    expect(session.active()).toBe(false);
    expect(document.cookie).not.toContain(cookieName);
  });

  it('does not create a session when the API rejects the token', async () => {
    getPrincipal.mockImplementationOnce(() => throwError(() => new Error('unauthorized')));
    const session = TestBed.inject(SessionService);
    await initialize();

    await expect(session.loginWithToken('invalid-token')).rejects.toThrow('unauthorized');
    expect(session.active()).toBe(false);
    expect(session.token()).toBeNull();
    expect(document.cookie).not.toContain(cookieName);
  });

  it('revalidates a Firebase token with the API before establishing an SSR principal', async () => {
    getAuthConfig.mockReturnValueOnce(of<AuthConfig>({ provider: 'firebase' }));
    const request = new Request('https://lazyfinance.cl/dashboard', {
      headers: { cookie: `${cookieName}=${encodeURIComponent(JSON.stringify({ token: 'verified-id-token' }))}` },
    });
    TestBed.configureTestingModule({ providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      { provide: REQUEST, useValue: request },
      { provide: RESPONSE_INIT, useValue: { headers: new Headers() } },
    ] });

    const session = TestBed.inject(SessionService);
    expect(session.active()).toBe(false);
    await initialize();
    expect(getPrincipal).toHaveBeenCalledExactlyOnceWith('verified-id-token');
    expect(session.user()).toEqual(principal);
    expect(session.token()).toBe('verified-id-token');
  });

  it('rejects a forged Firebase cookie user and an expired Firebase token during SSR', async () => {
    getAuthConfig.mockReturnValueOnce(of<AuthConfig>({ provider: 'firebase' }));
    const response = { headers: new Headers() };
    const request = new Request('https://lazyfinance.cl/dashboard', {
      headers: { cookie: `${cookieName}=${encodeURIComponent(JSON.stringify({ token: 'expired-id-token', user: principal }))}` },
    });
    TestBed.configureTestingModule({ providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      { provide: REQUEST, useValue: request },
      { provide: RESPONSE_INIT, useValue: response },
    ] });
    const session = TestBed.inject(SessionService);
    await initialize();
    expect(session.active()).toBe(false);
    expect(getPrincipal).not.toHaveBeenCalled();

    getAuthConfig.mockReturnValueOnce(of<AuthConfig>({ provider: 'firebase' }));
    getPrincipal.mockImplementationOnce(() => throwError(() => new Error('expired')));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: ApiService, useValue: { getAuthConfig, getPrincipal } },
      { provide: PLATFORM_ID, useValue: 'server' },
      { provide: REQUEST, useValue: new Request('https://lazyfinance.cl/dashboard', {
        headers: { cookie: `${cookieName}=${encodeURIComponent(JSON.stringify({ token: 'expired-id-token' }))}` },
      }) },
      { provide: RESPONSE_INIT, useValue: { headers: new Headers() } },
    ] });
    const restored = TestBed.inject(SessionService);
    await initialize();
    expect(restored.active()).toBe(false);
    expect(getPrincipal).toHaveBeenCalledWith('expired-id-token');
  });
});
