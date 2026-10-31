import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import type { AuthConfig } from '@lazyfinance/contracts';
import type { User as FirebaseUser } from 'firebase/auth';
import { SsrCookieService } from 'ngx-cookie-service-ssr';
import { from, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../api/api.service';
import { FirebaseService } from '../firebase/firebase.service';
import { SessionService } from './session.service';

const cookieName = 'lazyfinance-session';
const first = { userId: 'user-a', email: 'first@example.com', name: 'First user' };
const second = { userId: 'user-b', email: 'second@example.com', name: 'Second user' };

function firebaseUser(uid: string, token: string) {
  let currentToken = token;
  return {
    user: { uid, getIdToken: vi.fn(async () => currentToken) } as unknown as FirebaseUser,
    setToken: (next: string) => { currentToken = next; },
  };
}

function setup() {
  const firstUser = firebaseUser('firebase-a', 'token-a');
  const secondUser = firebaseUser('firebase-b', 'token-b');
  let onTokenChanged: (user: FirebaseUser | null) => void = () => {};
  const auth = {
    currentUser: firstUser.user as FirebaseUser | null,
    authStateReady: vi.fn(async () => {}),
    onIdTokenChanged: vi.fn((listener: (user: FirebaseUser | null) => void) => {
      onTokenChanged = listener;
      queueMicrotask(() => listener(auth.currentUser));
      return () => {};
    }),
  };
  const firebase = {
    init: vi.fn(async () => auth),
    auth: () => auth,
    signInWithGoogle: vi.fn(async () => auth.currentUser!),
    signOut: vi.fn(async () => { auth.currentUser = null; onTokenChanged(null); }),
  };
  const getAuthConfig = vi.fn(() => of<AuthConfig>({ provider: 'firebase' }));
  const getPrincipal = vi.fn((token: string) => of(token === 'token-b' ? second : first));
  TestBed.configureTestingModule({ providers: [
    { provide: ApiService, useValue: { getAuthConfig, getPrincipal } },
    { provide: FirebaseService, useValue: firebase },
  ] });
  const session = TestBed.inject(SessionService);
  return { session, firstUser, secondUser, auth, firebase, getPrincipal, onTokenChanged: (user: FirebaseUser | null) => onTokenChanged(user) };
}

describe('Firebase browser session', () => {
  afterEach(() => {
    document.cookie = `${cookieName}=; Max-Age=0; Path=/`;
    TestBed.resetTestingModule();
  });

  it('restores the SDK user through the API and stores only the verified ID token for SSR', async () => {
    document.cookie = `${cookieName}=${encodeURIComponent(JSON.stringify({ token: 'forged', user: second }))}; Path=/`;
    const { session, firebase, getPrincipal } = setup();
    await session.initClientSide();

    expect(firebase.init).toHaveBeenCalledOnce();
    expect(getPrincipal).toHaveBeenCalledExactlyOnceWith('token-a');
    expect(session.user()).toEqual(first);
    expect(session.active()).toBe(true);
    const cookie = TestBed.inject(SsrCookieService).get(cookieName);
    expect(JSON.parse(cookie)).toEqual({ token: 'token-a' });
  });

  it('refreshes rotated ID tokens without switching to a stale account response', async () => {
    const { session, firstUser, secondUser, auth, getPrincipal, onTokenChanged } = setup();
    await session.initClientSide();

    firstUser.setToken('token-a-refresh');
    onTokenChanged(firstUser.user);
    await vi.waitFor(() => expect(session.token()).toBe('token-a-refresh'));

    let completeOld!: (principal: typeof first) => void;
    getPrincipal.mockImplementation((token: string) => token === 'token-a-stale'
      ? from(new Promise<typeof first>((resolve) => { completeOld = resolve; }))
      : of(token === 'token-b' ? second : first));
    firstUser.setToken('token-a-stale');
    onTokenChanged(firstUser.user);
    await vi.waitFor(() => expect(completeOld).toBeDefined());
    auth.currentUser = secondUser.user;
    onTokenChanged(secondUser.user);
    await vi.waitFor(() => expect(session.user()).toEqual(second));
    completeOld(first);
    await Promise.resolve();
    expect(session.token()).toBe('token-b');
    expect(JSON.parse(TestBed.inject(SsrCookieService).get(cookieName))).toEqual({ token: 'token-b' });
  });

  it('clears a rejected restored token and can recover after Firebase rotates it', async () => {
    const { session, firstUser, getPrincipal, onTokenChanged } = setup();
    getPrincipal.mockImplementationOnce(() => throwError(() => new Error('Expired token')));
    await session.initClientSide();
    expect(session.active()).toBe(false);
    expect(TestBed.inject(SsrCookieService).get(cookieName)).toBe('');

    firstUser.setToken('token-a-refresh');
    onTokenChanged(firstUser.user);
    await vi.waitFor(() => expect(session.user()).toEqual(first));
    expect(session.token()).toBe('token-a-refresh');
  });

  it('finishes resolving when a Google popup and token observer race', async () => {
    const { session, secondUser, auth, firebase, onTokenChanged } = setup();
    await session.initClientSide();
    firebase.signInWithGoogle.mockImplementation(async () => {
      auth.currentUser = secondUser.user;
      onTokenChanged(secondUser.user);
      return secondUser.user;
    });

    await expect(session.loginWithGoogle()).resolves.toEqual(second);
    expect(session.isResolving()).toBe(false);
    expect(session.user()).toEqual(second);
  });

  it('clears browser state and the SSR cookie on Firebase sign-out', async () => {
    const { session, firebase } = setup();
    await session.initClientSide();
    await session.logout();

    expect(firebase.signOut).toHaveBeenCalledOnce();
    expect(session.active()).toBe(false);
    expect(TestBed.inject(SsrCookieService).get(cookieName)).toBe('');
  });

  it('does not restore a session from a late API response after logout', async () => {
    const { session, firstUser, getPrincipal, onTokenChanged } = setup();
    await session.initClientSide();
    let finish!: (principal: typeof first) => void;
    getPrincipal.mockImplementationOnce(() => from(new Promise<typeof first>((resolve) => { finish = resolve; })));
    firstUser.setToken('old-token');
    onTokenChanged(firstUser.user);
    await vi.waitFor(() => expect(finish).toBeDefined());

    await session.logout();
    finish(first);
    await Promise.resolve();
    expect(session.active()).toBe(false);
    expect(TestBed.inject(SsrCookieService).get(cookieName)).toBe('');
  });
});
