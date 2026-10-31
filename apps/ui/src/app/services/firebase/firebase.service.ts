import { isPlatformServer } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInWithPopup,
  type Auth,
  type User,
} from 'firebase/auth';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FirebaseService {
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private authInstance: Auth | null = null;

  auth(): Auth | null {
    return this.authInstance;
  }

  async init(): Promise<Auth> {
    if (this.isServer) throw new Error('Firebase Auth is only available in the browser');
    if (this.authInstance) return this.authInstance;
    const config = environment.firebaseConfig;
    if (Object.values(config).some((value) => !value || value.startsWith('REPLACE_WITH_'))) {
      throw new Error('Firebase Web configuration is missing');
    }

    const app = getApps().find(({ name }) => name === 'lazyfinance-browser')
      ?? initializeApp(config, 'lazyfinance-browser');
    const auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence);
    this.authInstance = auth;
    return auth;
  }

  async signInWithGoogle(): Promise<User> {
    const auth = await this.init();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return (await signInWithPopup(auth, provider)).user;
  }

  async signOut(): Promise<void> {
    if (this.authInstance) await this.authInstance.signOut();
  }
}
