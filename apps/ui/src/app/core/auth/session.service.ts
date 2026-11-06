import { isPlatformServer } from "@angular/common";
import {
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  Injectable,
  inject,
  PLATFORM_ID,
  REQUEST,
  signal,
  untracked,
} from "@angular/core";
import { Router } from "@angular/router";
import type {
  AuthConfig,
  AuthPrincipal,
  AuthProvider,
} from "@lazyfinance/contracts";
import type { User as FirebaseUser } from "firebase/auth";
import { SsrCookieService } from "ngx-cookie-service-ssr";
import { FirebaseService } from "../../services/firebase/firebase.service";
import { AuthApi } from "./auth-api";
import { AuthCredentials } from "./auth-credentials";

const SESSION_COOKIE = "lazyfinance-session";

function tokenOnlyCookie(value: unknown): string | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("token" in value) ||
    "user" in value
  )
    return null;

  return typeof value.token === "string" && value.token.trim()
    ? value.token.trim()
    : null;
}

@Injectable({ providedIn: "root" })
export class SessionService {
  private readonly cookies = inject(SsrCookieService);
  private readonly api = inject(AuthApi);
  private readonly credentials = inject(AuthCredentials);
  private readonly router = inject(Router);
  private readonly firebase = inject(FirebaseService);
  private readonly document = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private readonly resolving = signal(true);
  private readonly providerState = signal<AuthProvider | null>(null);
  private revision = 0;
  private firebaseUid: string | null = null;
  private pendingResolution: Promise<void> = Promise.resolve();
  private stopObservingTokens?: () => void;

  readonly isResolving = this.resolving.asReadonly();
  readonly provider = this.providerState.asReadonly();
  readonly user = computed(() => this.credentials.current()?.principal ?? null);
  readonly token = computed(() => this.credentials.current()?.token ?? null);
  readonly active = computed(() => this.user() !== null);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      ++this.revision;
      this.stopObservingTokens?.();
    });
    effect(() => {
      if (!this.credentials.expired()) return;

      untracked(() => {
        ++this.revision;
        this.clearLocalState();
        void this.router.navigateByUrl("/login");
      });
    });
  }

  async initServerSide(config: AuthConfig | null): Promise<void> {
    if (!this.isServer) return;

    const revision = ++this.revision;

    try {
      if (!config) return;

      this.providerState.set(config.provider);
      const token = this.readTokenCookie();
      if (!token) return;

      // Only the API's verified principal may establish SSR identity.
      const user = await this.api.verifyPrincipal(token);

      if (revision === this.revision) this.credentials.accept(user, token);
    } catch {
      if (revision === this.revision) this.clearLocalState();
    } finally {
      this.resolving.set(false);
    }
  }

  async initClientSide(config: AuthConfig | null): Promise<void> {
    if (this.isServer) return;

    const revision = ++this.revision;

    try {
      if (!config) {
        this.clearLocalState();
        return;
      }

      this.providerState.set(config.provider);
      if (config.provider === "mock") {
        const token = this.readTokenCookie();

        if (token) {
          const user = await this.api.verifyPrincipal(token);

          if (revision === this.revision) this.credentials.accept(user, token);
        }

        return;
      }

      const auth = this.firebase.auth();
      if (!auth) throw new Error("Firebase Auth could not be initialized");

      await auth.authStateReady();
      await new Promise<void>((resolve) => {
        let initial = true;
        this.stopObservingTokens?.();
        this.stopObservingTokens = auth.onIdTokenChanged(
          (firebaseUser) => {
            const revision = ++this.revision;
            this.resolving.set(true);

            if (this.firebaseUid !== firebaseUser?.uid) this.clearLocalState();

            this.pendingResolution = this.resolveFirebaseUser(
              firebaseUser,
              revision,
            )
              .catch(() => {
                if (revision === this.revision) this.clearLocalState();
              })
              .finally(() => {
                if (revision !== this.revision) return;

                this.resolving.set(false);

                if (initial) {
                  initial = false;
                  resolve();
                }
              });
          },
          () => {
            ++this.revision;
            this.clearLocalState();
            this.resolving.set(false);

            if (initial) {
              initial = false;
              resolve();
            }
          },
        );
      });
    } catch {
      if (revision === this.revision) this.clearLocalState();
    } finally {
      this.resolving.set(false);
    }
  }

  async loginWithToken(token: string): Promise<AuthPrincipal> {
    if (this.providerState() !== "mock")
      throw new Error("Mock login is not available");

    const trimmed = token.trim();
    if (!trimmed) throw new Error("A token is required");

    const revision = ++this.revision;
    this.clearLocalState();
    const user = await this.api.verifyPrincipal(trimmed);
    if (revision !== this.revision)
      throw new Error("Session changed during login");

    this.credentials.accept(user, trimmed);
    this.writeCookie(JSON.stringify({ token: trimmed }));

    return user;
  }

  async loginWithGoogle(): Promise<AuthPrincipal> {
    if (this.isServer || this.providerState() !== "firebase")
      throw new Error("Firebase login is not available");

    const firebaseUser = await this.firebase.signInWithGoogle();
    const revision = ++this.revision;
    this.resolving.set(true);

    try {
      await this.resolveFirebaseUser(firebaseUser, revision);

      if (revision !== this.revision) await this.pendingResolution;

      const user = this.user();
      if (!user) throw new Error("Could not establish a Firebase session");

      return user;
    } finally {
      if (revision === this.revision) this.resolving.set(false);
    }
  }

  async logout(): Promise<void> {
    ++this.revision;
    this.clearLocalState();

    if (!this.isServer && this.providerState() === "firebase")
      await this.firebase.signOut();
  }

  private async resolveFirebaseUser(
    firebaseUser: FirebaseUser | null,
    revision: number,
  ): Promise<void> {
    if (!firebaseUser) {
      if (revision === this.revision) this.clearLocalState();

      return;
    }

    const token = await firebaseUser.getIdToken();
    const user = await this.api.verifyPrincipal(token);
    if (
      revision !== this.revision ||
      this.firebase.auth()?.currentUser?.uid !== firebaseUser.uid
    )
      return;

    this.firebaseUid = firebaseUser.uid;
    this.credentials.accept(user, token);
    // Browser SDK owns token refresh. The cookie is an SSR handoff, not a principal.
    this.writeCookie(JSON.stringify({ token }));
  }

  private clearLocalState(): void {
    this.firebaseUid = null;
    this.credentials.clear();
    this.cookies.delete(SESSION_COOKIE, "/");
  }

  private writeCookie(value: string): void {
    this.cookies.set(SESSION_COOKIE, value, {
      path: "/",
      sameSite: "Lax",
      secure: this.isServer
        ? (this.request?.url.startsWith("https:") ?? false)
        : this.document.location.protocol === "https:",
    });
  }

  private readTokenCookie(): string | null {
    const raw = this.cookies.get(SESSION_COOKIE);
    if (!raw) return null;

    try {
      const parsed: unknown = JSON.parse(raw);
      const token = tokenOnlyCookie(parsed);
      if (token) return token;
    } catch {
      /* Discard malformed token cookie. */
    }

    this.cookies.delete(SESSION_COOKIE, "/");

    return null;
  }
}
