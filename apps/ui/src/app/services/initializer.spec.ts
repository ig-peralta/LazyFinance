import '@angular/compiler';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AuthConfig, AuthProvider } from '@lazyfinance/contracts';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from './api/api.service';
import { FirebaseService } from './firebase/firebase.service';
import { initializeServices } from './initializer';
import { SessionService } from './session/session.service';

describe('app-wide service initialization', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(platform: 'browser' | 'server', provider: AuthProvider = 'mock', failConfig = false) {
    const order: string[] = [];
    const getAuthConfig = vi.fn(() => {
      order.push('config');
      return failConfig ? throwError(() => new Error('API unavailable')) : of<AuthConfig>({ provider });
    });
    const init = vi.fn(async () => { order.push('firebase'); });
    const initServerSide = vi.fn(async (_config: AuthConfig | null) => { order.push('session-server'); });
    const initClientSide = vi.fn(async (_config: AuthConfig | null) => { order.push('session-browser'); });
    TestBed.configureTestingModule({ providers: [
      { provide: PLATFORM_ID, useValue: platform },
      { provide: ApiService, useValue: { getAuthConfig } },
      { provide: FirebaseService, useValue: { init } },
      { provide: SessionService, useValue: { initServerSide, initClientSide } },
    ] });
    return {
      order, getAuthConfig, init, initServerSide, initClientSide,
      run: () => TestBed.runInInjectionContext(initializeServices),
    };
  }

  it('restores the server session without initializing browser Firebase', async () => {
    const { run, order, init, initServerSide, initClientSide } = setup('server', 'firebase');
    await run();
    expect(order).toEqual(['config', 'session-server']);
    expect(init).not.toHaveBeenCalled();
    expect(initServerSide).toHaveBeenCalledWith({ provider: 'firebase' });
    expect(initClientSide).not.toHaveBeenCalled();
  });

  it('starts mock sessions without Firebase Web configuration', async () => {
    const { run, order, init, initClientSide } = setup('browser');
    await run();
    expect(order).toEqual(['config', 'session-browser']);
    expect(init).not.toHaveBeenCalled();
    expect(initClientSide).toHaveBeenCalledWith({ provider: 'mock' });
  });

  it('initializes Firebase before restoring the browser session', async () => {
    const { run, order, init, initClientSide } = setup('browser', 'firebase');
    await run();
    expect(order).toEqual(['config', 'firebase', 'session-browser']);
    expect(init).toHaveBeenCalledOnce();
    expect(initClientSide).toHaveBeenCalledWith({ provider: 'firebase' });
  });

  it('passes an unavailable provider through as an anonymous session', async () => {
    const { run, init, initClientSide } = setup('browser', 'firebase', true);
    await run();
    expect(init).not.toHaveBeenCalled();
    expect(initClientSide).toHaveBeenCalledWith(null);
  });

  it('lets the session fail closed when Firebase initialization fails', async () => {
    const { run, init, initClientSide } = setup('browser', 'firebase');
    init.mockRejectedValueOnce(new Error('Firebase unavailable'));
    await run();
    expect(initClientSide).toHaveBeenCalledWith({ provider: 'firebase' });
  });
});
