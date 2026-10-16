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
import type { AuthPrincipal } from '@lazyfinance/contracts';
import { SsrCookieService } from 'ngx-cookie-service-ssr';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import { isSessionState } from './session.utils';
import type { SessionState } from './session.types';

const SESSION_COOKIE = 'lazyfinance-session';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly cookies = inject(SsrCookieService);
  private readonly api = inject(ApiService);
  private readonly document = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private readonly state = signal<SessionState>(null);
  private readonly resolving = signal(true);

  readonly isResolving = this.resolving.asReadonly();
  readonly user = computed(() => this.state()?.user ?? null);
  readonly token = computed(() => this.state()?.token ?? null);
  readonly active = computed(() => this.user() !== null);

  initServerSide(): void {
    if (this.isServer) this.loadCookie();
  }

  initClientSide(): void {
    if (!this.isServer) this.loadCookie();
    // future firebase initiazation should be done here
  }

  async loginWithToken(token: string): Promise<AuthPrincipal> {
    const trimmed = token.trim();
    if (!trimmed) throw new Error('A token is required');

    const user = await firstValueFrom(this.api.getPrincipal(trimmed));
    this.setState({ user, token: trimmed });
    return user;
  }

  private setState(state: Exclude<SessionState, null>): void {
    this.state.set(state);
    this.cookies.set(SESSION_COOKIE, JSON.stringify(this.state()), {
      path: '/',
      sameSite: 'Lax',
      secure: this.isServer
        ? (this.request?.url.startsWith('https:') ?? false)
        : this.document.location.protocol === 'https:',
    });
  }

  clear(): void {
    this.state.set(null);
    this.cookies.delete(SESSION_COOKIE, '/');
  }

  private loadCookie(): void {
    const cookie = this.cookies.get(SESSION_COOKIE);
    let state: SessionState | null = null;

    if (cookie) {
      try {
        const parsed: unknown = JSON.parse(cookie);
        if (isSessionState(parsed)) {
          state = {
            token: parsed.token.trim(),
            user: {
              userId: parsed.user.userId,
              email: parsed.user.email,
              name: parsed.user.name,
            },
          };
        }
      } catch {
        // Ignore malformed cookies and let the client clear them.
      }

      if (!state && !this.isServer) this.cookies.delete(SESSION_COOKIE, '/');
    }

    this.state.set(state);
    this.resolving.set(false);
  }
}
