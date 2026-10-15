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
import { SsrCookieService } from 'ngx-cookie-service-ssr';

type SessionState = { token: string } | null;

const SESSION_COOKIE = 'lazyfinance-session';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly cookies = inject(SsrCookieService);
  private readonly document = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private readonly state = signal<SessionState>(null);
  private readonly resolving = signal(true);

  readonly isResolving = this.resolving.asReadonly();
  readonly token = computed(() => this.state()?.token ?? null);
  readonly active = computed(() => this.token() !== null);

  initServerSide(): void {
    if (this.isServer) this.loadCookie();
  }

  initClientSide(): void {
    if (!this.isServer) this.loadCookie();
    // future firebase initiazation should be done here
  }

  setToken(token: string): void {
    const trimmed = token.trim();
    if (!trimmed) {
      this.clear();
      return;
    }

    this.state.set({ token: trimmed });
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
        if (
          parsed &&
          typeof parsed === 'object' &&
          'token' in parsed &&
          typeof parsed.token === 'string' &&
          parsed.token.trim()
        ) {
          state = { token: parsed.token.trim() };
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
