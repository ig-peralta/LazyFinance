import { isPlatformServer } from '@angular/common';
import {
  DOCUMENT,
  Injectable,
  PLATFORM_ID,
  REQUEST,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { AuthPrincipal, AuthProvider } from '@lazyfinance/contracts';
import type { User as FirebaseUser } from 'firebase/auth';
import { SsrCookieService } from 'ngx-cookie-service-ssr';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import { FirebaseService } from '../firebase/firebase.service';
import type { SessionState } from './session.types';

const SESSION_COOKIE = 'lazyfinance-session';

function tokenOnlyCookie(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('token' in value) || 'user' in value) return null;
  return typeof value.token === 'string' && value.token.trim() ? value.token.trim() : null;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly cookies = inject(SsrCookieService);
  private readonly api = inject(ApiService);
  private readonly firebase = inject(FirebaseService);
  private readonly document = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private readonly state = signal<SessionState>(null);
  private readonly resolving = signal(true);
  private readonly providerState = signal<AuthProvider | null>(null);
  private revision = 0;
  private firebaseUid: string | null = null;
  private pendingResolution: Promise<void> = Promise.resolve();

  readonly isResolving = this.resolving.asReadonly();
  readonly provider = this.providerState.asReadonly();
  readonly user = computed(() => this.state()?.user ?? null);
  readonly token = computed(() => this.state()?.token ?? null);
  readonly active = computed(() => this.user() !== null);

  async initServerSide(): Promise<void> {
    if (!this.isServer) return;
    try {
      const config = await firstValueFrom(this.api.getAuthConfig());
      this.providerState.set(config.provider);
      const token = this.readTokenCookie();
      if (!token) return;
      // Only the API's verified principal may establish SSR identity.
      const user = await firstValueFrom(this.api.getPrincipal(token));
      this.state.set({ user, token });
    } catch {
      this.state.set(null);
      this.cookies.delete(SESSION_COOKIE, '/');
    } finally {
      this.resolving.set(false);
    }
  }

  async initClientSide(): Promise<void> {
    if (this.isServer) return;
    try {
      const config = await firstValueFrom(this.api.getAuthConfig());
      this.providerState.set(config.provider);
      if (config.provider === 'mock') {
        const token = this.readTokenCookie();
        if (token) {
          const user = await firstValueFrom(this.api.getPrincipal(token));
          this.state.set({ user, token });
        }
        return;
      }

      const auth = await this.firebase.init();
      await auth.authStateReady();
      await new Promise<void>((resolve) => {
        let initial = true;
        auth.onIdTokenChanged((firebaseUser) => {
          const revision = ++this.revision;
          this.resolving.set(true);
          if (this.firebaseUid !== firebaseUser?.uid) this.clearLocalState();
          this.pendingResolution = this.resolveFirebaseUser(firebaseUser, revision)
            .catch(() => { if (revision === this.revision) this.clearLocalState(); })
            .finally(() => {
              if (revision !== this.revision) return;
              this.resolving.set(false);
              if (initial) { initial = false; resolve(); }
            });
        }, () => {
          this.clearLocalState();
          this.resolving.set(false);
          if (initial) { initial = false; resolve(); }
        });
      });
    } catch {
      this.clearLocalState();
    } finally {
      this.resolving.set(false);
    }
  }

  async loginWithToken(token: string): Promise<AuthPrincipal> {
    if (this.providerState() !== 'mock') throw new Error('Mock login is not available');
    const trimmed = token.trim();
    if (!trimmed) throw new Error('A token is required');
    const user = await firstValueFrom(this.api.getPrincipal(trimmed));
    this.state.set({ user, token: trimmed });
    this.writeCookie(JSON.stringify({ token: trimmed }));
    return user;
  }

  async loginWithGoogle(): Promise<AuthPrincipal> {
    if (this.isServer || this.providerState() !== 'firebase') throw new Error('Firebase login is not available');
    const firebaseUser = await this.firebase.signInWithGoogle();
    const revision = ++this.revision;
    this.resolving.set(true);
    try {
      await this.resolveFirebaseUser(firebaseUser, revision);
      if (revision !== this.revision) await this.pendingResolution;
      const user = this.user();
      if (!user) throw new Error('Could not establish a Firebase session');
      return user;
    } finally {
      if (revision === this.revision) this.resolving.set(false);
    }
  }

  async logout(): Promise<void> {
    ++this.revision;
    this.clearLocalState();
    if (!this.isServer && this.providerState() === 'firebase') await this.firebase.signOut();
  }

  clear(): void {
    void this.logout().catch(() => { this.clearLocalState(); });
  }

  private async resolveFirebaseUser(firebaseUser: FirebaseUser | null, revision: number): Promise<void> {
    if (!firebaseUser) {
      if (revision === this.revision) this.clearLocalState();
      return;
    }
    const token = await firebaseUser.getIdToken();
    const user = await firstValueFrom(this.api.getPrincipal(token));
    if (revision !== this.revision || this.firebase.auth()?.currentUser?.uid !== firebaseUser.uid) return;

    this.firebaseUid = firebaseUser.uid;
    this.state.set({ user, token });
    // Browser SDK owns token refresh. The cookie is an SSR handoff, not a principal.
    this.writeCookie(JSON.stringify({ token }));
  }

  private clearLocalState(): void {
    this.firebaseUid = null;
    this.state.set(null);
    this.cookies.delete(SESSION_COOKIE, '/');
  }

  private writeCookie(value: string): void {
    this.cookies.set(SESSION_COOKIE, value, {
      path: '/',
      sameSite: 'Lax',
      secure: this.isServer
        ? (this.request?.url.startsWith('https:') ?? false)
        : this.document.location.protocol === 'https:',
    });
  }

  private readTokenCookie(): string | null {
    const raw = this.cookies.get(SESSION_COOKIE);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      const token = tokenOnlyCookie(parsed);
      if (token) return token;
    } catch { /* Discard malformed token cookie. */ }
    this.cookies.delete(SESSION_COOKIE, '/');
    return null;
  }
}
