import '@angular/compiler';
import { PLATFORM_ID, REQUEST, RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../api/api.service';
import { SessionService } from './session.service';

const cookieName = 'lazyfinance-session';
const principal = { userId: 'demo-user', email: 'demo@lazyfinance.cl', name: 'Camila Rojas' };
const getPrincipal = vi.fn((_token: string) => of(principal));

beforeEach(() => {
  getPrincipal.mockReset();
  getPrincipal.mockImplementation(() => of(principal));
  TestBed.configureTestingModule({
    providers: [{ provide: ApiService, useValue: { getPrincipal } }],
  });
});

afterEach(() => {
  document.cookie = `${cookieName}=; Max-Age=0; Path=/`;
  TestBed.resetTestingModule();
});

describe('SessionService', () => {
  it('restores the token from the incoming SSR request cookie', () => {
    const token = 'first-user-token';
    const request = new Request('http://localhost:4200/', {
      headers: {
        cookie: `${cookieName}=${encodeURIComponent(JSON.stringify({ token: ` ${token} `, user: principal }))}`,
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
    session.initServerSide();
    expect(session.token()).toBe(token);
    expect(session.user()).toEqual(principal);
    expect(session.active()).toBe(true);
    expect(session.isResolving()).toBe(false);
  });

  it('ignores a malformed session cookie during SSR', () => {
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
    session.initServerSide();
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
    session.initServerSide();
    await session.loginWithToken('server-token');

    expect(session.user()).toEqual(principal);
    expect(response.headers.get('Set-Cookie')).toContain(cookieName);
    expect(response.headers.get('Set-Cookie')).toContain('Path=/');
    expect(response.headers.get('Set-Cookie')).toContain('Secure');
    expect(response.headers.get('Set-Cookie')).toContain('SameSite=Lax');
  });

  it('restores a browser session after reload', () => {
    document.cookie = `${cookieName}=${encodeURIComponent(JSON.stringify({ token: 'saved-token', user: principal }))}; Path=/`;
    const session = TestBed.inject(SessionService);

    session.initClientSide();

    expect(session.token()).toBe('saved-token');
    expect(session.user()).toEqual(principal);
    expect(session.active()).toBe(true);
  });

  it('clears a session cookie with an incomplete user', () => {
    document.cookie = `${cookieName}=${encodeURIComponent(JSON.stringify({ token: 'demo-token', user: { userId: 'demo-user' } }))}; Path=/`;
    const session = TestBed.inject(SessionService);

    session.initClientSide();

    expect(session.active()).toBe(false);
    expect(session.token()).toBeNull();
    expect(document.cookie).not.toContain(cookieName);
  });

  it('logs in only after the API returns a principal, then persists and clears the session', async () => {
    const session = TestBed.inject(SessionService);
    session.initClientSide();
    await session.loginWithToken('  demo-token  ');

    expect(getPrincipal).toHaveBeenCalledWith('demo-token');
    expect(session.token()).toBe('demo-token');
    expect(session.user()).toEqual(principal);
    expect(session.active()).toBe(true);
    expect(document.cookie).toContain(cookieName);

    session.clear();
    expect(session.token()).toBeNull();
    expect(session.user()).toBeNull();
    expect(session.active()).toBe(false);
    expect(document.cookie).not.toContain(cookieName);
  });

  it('does not create a session when the API rejects the token', async () => {
    getPrincipal.mockImplementationOnce(() => throwError(() => new Error('unauthorized')));
    const session = TestBed.inject(SessionService);
    session.initClientSide();

    await expect(session.loginWithToken('invalid-token')).rejects.toThrow('unauthorized');
    expect(session.active()).toBe(false);
    expect(session.token()).toBeNull();
    expect(document.cookie).not.toContain(cookieName);
  });
});
