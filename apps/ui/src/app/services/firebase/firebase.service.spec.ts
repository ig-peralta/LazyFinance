import '@angular/compiler';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { deleteApp } from 'firebase/app';
import { afterEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { FirebaseService } from './firebase.service';

const originalConfig = { ...environment.firebaseConfig };

describe('FirebaseService', () => {
  afterEach(() => {
    Object.assign(environment.firebaseConfig, originalConfig);
    TestBed.resetTestingModule();
  });

  it('does not initialize Firebase Auth during server rendering', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    await expect(TestBed.inject(FirebaseService).init()).rejects.toThrow('only available in the browser');
  });

  it('reports missing public Web app configuration rather than initializing placeholders', async () => {
    await expect(TestBed.inject(FirebaseService).init()).rejects.toThrow('Firebase Web configuration is missing');
  });

  it('initializes and reuses one browser Auth instance with configured public identifiers', async () => {
    const config = {
      apiKey: 'public-api-key', authDomain: 'lazyfinance-dev.firebaseapp.com',
      projectId: 'lazyfinance-dev', appId: '1:123:web:abc',
    };
    Object.assign(environment.firebaseConfig, config);
    const firebase = TestBed.inject(FirebaseService);
    const first = await firebase.init();
    const second = await firebase.init();
    expect(first).toBe(second);
    expect(first.app.name).toBe('lazyfinance-browser');
    expect(first.app.options).toMatchObject(config);
    await deleteApp(first.app);
  });
});
