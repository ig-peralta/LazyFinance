import '@angular/compiler';
import { PLATFORM_ID, REQUEST, RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionService } from './session.service';

const cookieName = 'lazyfinance-session';

afterEach(() => {
  document.cookie = `${cookieName}=; Max-Age=0; Path=/`;
  TestBed.resetTestingModule();
});

describe('SessionService', () => {
  it('restores the token from the incoming SSR request cookie', () => {
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
    session.initServerSide();
    expect(session.token()).toBe(token);
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

  it('writes a secure session cookie to the SSR response when the request uses HTTPS', () => {
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
    session.setToken('server-token');

    expect(response.headers.get('Set-Cookie')).toContain(cookieName);
    expect(response.headers.get('Set-Cookie')).toContain('Path=/');
    expect(response.headers.get('Set-Cookie')).toContain('Secure');
    expect(response.headers.get('Set-Cookie')).toContain('SameSite=Lax');
  });

  it('restores a browser session after reload', () => {
    document.cookie = `${cookieName}=${encodeURIComponent(JSON.stringify({ token: 'saved-token' }))}; Path=/`;
    const session = TestBed.inject(SessionService);

    session.initClientSide();

    expect(session.token()).toBe('saved-token');
    expect(session.active()).toBe(true);
  });

  it('persists and clears a browser session cookie', () => {
    const session = TestBed.inject(SessionService);
    session.initClientSide();
    session.setToken('  demo-token  ');

    expect(session.token()).toBe('demo-token');
    expect(session.active()).toBe(true);
    expect(document.cookie).toContain(cookieName);

    session.clear();
    expect(session.token()).toBeNull();
    expect(session.active()).toBe(false);
    expect(document.cookie).not.toContain(cookieName);
  });
});
