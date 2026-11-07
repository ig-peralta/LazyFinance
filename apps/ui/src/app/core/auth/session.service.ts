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

export interface FirebaseAccount {
  readonly uid: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly google: boolean;
  readonly password: boolean;
}

type FirebaseCommand = {
  controller: AbortController;
  uid?: string;
  userId?: string;
};

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
  private firebaseCommand?: FirebaseCommand;
  private sdkCommand?: FirebaseCommand;
  private signingOut?: Promise<void>;
  private allowFirebaseEvents = true;
  private readonly firebaseAccountState = signal<FirebaseAccount | null>(null);
  private readonly googleLinkProof = signal<{
    uid: string;
    userId: string;
    expiresAt: number;
  } | null>(null);
  private stopObservingTokens?: () => void;

  readonly isResolving = this.resolving.asReadonly();
  readonly provider = this.providerState.asReadonly();
  readonly user = computed(() => this.credentials.current()?.principal ?? null);
  readonly token = computed(() => this.credentials.current()?.token ?? null);
  readonly active = computed(() => this.user() !== null);
  readonly firebaseAccount = this.firebaseAccountState.asReadonly();
  readonly googleLinkReady = computed(() => {
    const proof = this.googleLinkProof();
    return Boolean(
      proof &&
        proof.uid === this.firebaseAccount()?.uid &&
        proof.userId === this.user()?.userId &&
        proof.expiresAt > Date.now(),
    );
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      ++this.revision;
      this.allowFirebaseEvents = false;
      this.cancelFirebaseCommand();
      this.stopObservingTokens?.();
    });
    effect(() => {
      if (!this.credentials.expired()) return;

      untracked(() => {
        ++this.revision;
        this.allowFirebaseEvents = false;
        this.cancelFirebaseCommand();
        this.clearLocalState();
        this.resolving.set(false);
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
        const finishInitial = () => {
          if (initial) {
            initial = false;
            resolve();
          }
        };
        this.stopObservingTokens?.();
        this.stopObservingTokens = auth.onIdTokenChanged(
          (firebaseUser) => {
            if (!this.allowFirebaseEvents) {
              this.clearLocalState();
              finishInitial();
              return;
            }
            if (this.firebaseCommand || this.sdkCommand) {
              // Explicit commands own acceptance. Reauthentication/forced token
              // refresh must not race their API verification or finish a login early.
              const expectedUid =
                this.firebaseCommand?.uid ?? this.sdkCommand?.uid;
              if (expectedUid && expectedUid !== firebaseUser?.uid) {
                ++this.revision;
                this.allowFirebaseEvents = false;
                this.cancelFirebaseCommand();
                this.clearLocalState();
                this.resolving.set(false);
              }
              finishInitial();
              return;
            }
            const revision = ++this.revision;
            this.resolving.set(true);

            if (this.firebaseUid !== firebaseUser?.uid) this.clearLocalState();
            this.publishFirebaseAccount(firebaseUser);

            void this.resolveFirebaseUser(firebaseUser, revision)
              .catch(() => {
                if (revision === this.revision) this.clearLocalState(true);
              })
              .finally(() => {
                if (revision === this.revision) this.resolving.set(false);
                finishInitial();
              });
          },
          () => {
            ++this.revision;
            this.allowFirebaseEvents = false;
            this.cancelFirebaseCommand();
            this.clearLocalState();
            this.resolving.set(false);

            finishInitial();
          },
        );
      });
    } catch {
      if (revision === this.revision) this.clearLocalState();
    } finally {
      if (revision === this.revision && !this.firebaseCommand)
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

  async loginWithGoogle(signal?: AbortSignal): Promise<AuthPrincipal> {
    return this.runFirebaseCommand(
      null,
      async (command) => {
        this.clearLocalState();
        const user = await this.invokeFirebaseSdk(command, () =>
          this.firebase.signInWithGoogle(),
        );
        return this.verifyFirebaseCommand(command, user);
      },
      signal,
    );
  }

  async loginWithPassword(
    email: string,
    password: string,
    signal?: AbortSignal,
  ): Promise<AuthPrincipal> {
    return this.runFirebaseCommand(
      null,
      async (command) => {
        this.clearLocalState();
        const user = await this.invokeFirebaseSdk(command, () =>
          this.firebase.signInWithPassword(email, password),
        );
        return this.verifyFirebaseCommand(command, user);
      },
      signal,
    );
  }

  async registerWithPassword(
    email: string,
    password: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.runFirebaseCommand(
      null,
      async (command) => {
        this.clearLocalState();
        const user = await this.invokeFirebaseSdk(command, () =>
          this.firebase.createPasswordAccount(email, password),
        );
        // Creation signs into Firebase, but an unverified address must not create
        // an application principal or a trusted SSR cookie.
        await this.invokeFirebaseSdk(command, () =>
          this.firebase.sendVerification(user, command.controller.signal),
        );
      },
      signal,
    );
  }

  async resendVerification(signal?: AbortSignal): Promise<void> {
    const user = this.requireFirebaseUser(false);
    await this.runFirebaseCommand(
      user,
      async (command) => {
        await this.invokeFirebaseSdk(command, () =>
          this.firebase.sendVerification(user, command.controller.signal),
        );
      },
      signal,
    );
  }

  async checkEmailVerification(signal?: AbortSignal): Promise<boolean> {
    const user = this.requireFirebaseUser(false);
    return this.runFirebaseCommand(
      user,
      async (command) => {
        await this.invokeFirebaseSdk(command, () =>
          this.firebase.reloadUser(user, command.controller.signal),
        );
        if (!user.emailVerified) return false;
        await this.verifyFirebaseCommand(command, user, true);
        return true;
      },
      signal,
    );
  }

  async resetPassword(email: string, signal?: AbortSignal): Promise<void> {
    this.requireFirebaseBrowser();
    signal?.throwIfAborted();
    await this.firebase.resetPassword(email);
    signal?.throwIfAborted();
  }

  async prepareGoogleLink(
    password: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const user = this.requireFirebaseUser();
    if (!this.firebaseAccount()?.password || this.firebaseAccount()?.google)
      throw new Error("An unlinked password account is required");

    this.googleLinkProof.set(null);
    await this.runFirebaseCommand(
      user,
      async (command) => {
        await this.invokeFirebaseSdk(command, () =>
          this.firebase.reauthenticatePassword(
            user,
            password,
            command.controller.signal,
          ),
        );
        const principal = await this.verifyFirebaseCommand(command, user, true);
        this.googleLinkProof.set({
          uid: user.uid,
          userId: principal.userId,
          expiresAt: Date.now() + 5 * 60_000,
        });
      },
      signal,
    );
  }

  async linkGoogle(signal?: AbortSignal): Promise<void> {
    const user = this.requireFirebaseUser();
    const proof = this.googleLinkProof();
    // Date.now() in a computed is not a timer: enforce expiry again at use.
    if (
      !proof ||
      proof.uid !== user.uid ||
      proof.userId !== this.user()?.userId ||
      proof.expiresAt <= Date.now()
    ) {
      this.googleLinkProof.set(null);
      throw new Error("Confirm your current password before linking Google");
    }
    this.googleLinkProof.set(null);
    await this.runFirebaseCommand(
      user,
      async (command) => {
        const linked = await this.invokeFirebaseSdk(command, () =>
          this.firebase.linkGoogle(user, command.controller.signal),
        );
        await this.verifyFirebaseCommand(command, linked, true);
      },
      signal,
    );
  }

  async linkPassword(password: string, signal?: AbortSignal): Promise<void> {
    const user = this.requireFirebaseUser();
    await this.runFirebaseCommand(
      user,
      async (command) => {
        const linked = await this.invokeFirebaseSdk(command, () =>
          this.firebase.linkPassword(user, password, command.controller.signal),
        );
        await this.verifyFirebaseCommand(command, linked, true);
      },
      signal,
    );
  }

  async logout(): Promise<void> {
    ++this.revision;
    this.allowFirebaseEvents = false;
    this.cancelFirebaseCommand();
    this.clearLocalState();
    this.resolving.set(false);

    if (!this.isServer && this.providerState() === "firebase")
      await this.signOutFirebase();
  }

  private async resolveFirebaseUser(
    firebaseUser: FirebaseUser | null,
    revision: number,
    forceRefresh = false,
    command?: FirebaseCommand,
  ): Promise<AuthPrincipal | null> {
    if (!firebaseUser) {
      if (revision === this.revision) this.clearLocalState();

      return null;
    }

    const token = await firebaseUser.getIdToken(forceRefresh);
    if (command) this.assertFirebaseCommand(command, firebaseUser);
    if (
      revision !== this.revision ||
      this.firebase.auth()?.currentUser?.uid !== firebaseUser.uid
    )
      return null;
    const user = command
      ? await this.api.verifyPrincipal(token, command.controller.signal)
      : await this.api.verifyPrincipal(token);
    if (command) this.assertFirebaseCommand(command, firebaseUser);
    if (
      revision !== this.revision ||
      this.firebase.auth()?.currentUser?.uid !== firebaseUser.uid
    )
      return null;

    if (command?.userId && user.userId !== command.userId) {
      ++this.revision;
      this.allowFirebaseEvents = false;
      this.clearLocalState();
      throw new Error("Linking changed the application owner");
    }

    this.firebaseUid = firebaseUser.uid;
    this.publishFirebaseAccount(firebaseUser);
    this.credentials.accept(user, token);
    // Browser SDK owns token refresh. The cookie is an SSR handoff, not a principal.
    this.writeCookie(JSON.stringify({ token }));
    return user;
  }

  private async runFirebaseCommand<Result>(
    expectedUser: FirebaseUser | null,
    operation: (command: FirebaseCommand) => Promise<Result>,
    signal?: AbortSignal,
  ): Promise<Result> {
    this.requireFirebaseBrowser();
    signal?.throwIfAborted();
    if (this.firebaseCommand || this.sdkCommand || this.signingOut)
      throw new Error("Another Firebase action is still pending");
    const command: FirebaseCommand = {
      controller: new AbortController(),
      uid: expectedUser?.uid,
      userId: expectedUser ? this.user()?.userId : undefined,
    };
    this.firebaseCommand = command;
    const cancel = () => {
      command.controller.abort(signal?.reason);
      this.googleLinkProof.set(null);
      if (!command.userId && this.firebaseCommand === command) {
        ++this.revision;
        this.allowFirebaseEvents = false;
        this.clearLocalState();
      }
    };
    signal?.addEventListener("abort", cancel, { once: true });
    this.allowFirebaseEvents = true;
    ++this.revision;
    this.resolving.set(true);

    try {
      return await operation(command);
    } catch (error) {
      command.controller.signal.throwIfAborted();
      if (this.firebaseCommand === command && !command.userId) {
        this.clearLocalState(true);
        if (!command.uid) this.allowFirebaseEvents = false;
      }
      throw error;
    } finally {
      signal?.removeEventListener("abort", cancel);
      await this.clearCancelledFirebaseUser(command);
      if (this.firebaseCommand === command) {
        const user = this.firebase.auth()?.currentUser;
        if (command.uid && user?.uid !== command.uid) {
          // SDK guards can reject before returning a result. An account change
          // must still clear the old principal, even without an observer event.
          ++this.revision;
          this.allowFirebaseEvents = false;
          this.clearLocalState();
        } else if (
          this.allowFirebaseEvents &&
          user &&
          user.uid === command.uid
        ) {
          // A cancelled/failed link may already have changed Firebase. Reflect
          // its actual methods without claiming the credential mutation rolled back.
          this.publishFirebaseAccount(user);
        }
        this.firebaseCommand = undefined;
        this.resolving.set(false);
      }
    }
  }

  private async invokeFirebaseSdk(
    command: FirebaseCommand,
    operation: () => Promise<FirebaseUser>,
  ): Promise<FirebaseUser> {
    command.controller.signal.throwIfAborted();
    this.sdkCommand = command;
    try {
      const user = await operation();
      command.uid ??= user.uid;
      this.assertFirebaseCommand(command, user);
      this.publishFirebaseAccount(user);
      return user;
    } finally {
      // Keep the SDK barrier through cleanup: a cancelled popup must not finish
      // signing into its old user after another explicit login has started.
      await this.clearCancelledFirebaseUser(command);
      if (this.sdkCommand === command) this.sdkCommand = undefined;
    }
  }

  private async verifyFirebaseCommand(
    command: FirebaseCommand,
    user: FirebaseUser,
    forceRefresh = false,
  ): Promise<AuthPrincipal> {
    this.assertFirebaseCommand(command, user);
    const principal = await this.resolveFirebaseUser(
      user,
      ++this.revision,
      forceRefresh,
      command,
    );
    this.assertFirebaseCommand(command, user);
    if (!principal)
      throw new DOMException(
        "Session changed during verification",
        "AbortError",
      );
    return principal;
  }

  private assertFirebaseCommand(
    command: FirebaseCommand,
    user: FirebaseUser,
  ): void {
    command.controller.signal.throwIfAborted();
    if (
      this.firebaseCommand !== command ||
      this.firebase.auth()?.currentUser?.uid !== user.uid ||
      (command.uid && command.uid !== user.uid) ||
      (command.userId && command.userId !== this.user()?.userId)
    ) {
      if (this.firebaseCommand === command) {
        ++this.revision;
        this.allowFirebaseEvents = false;
        this.clearLocalState();
      }
      throw new DOMException(
        "Session changed during Firebase action",
        "AbortError",
      );
    }
  }

  private requireFirebaseBrowser(): void {
    if (this.isServer || this.providerState() !== "firebase")
      throw new Error(
        "Firebase is only available in the configured browser flow",
      );
  }

  private requireFirebaseUser(verified = true): FirebaseUser {
    this.requireFirebaseBrowser();
    const user = this.firebase.auth()?.currentUser;
    if (
      !this.allowFirebaseEvents ||
      !user ||
      this.firebaseAccount()?.uid !== user.uid ||
      (verified && (!this.active() || this.firebaseUid !== user.uid))
    ) {
      throw new Error("A current verified Firebase session is required");
    }
    return user;
  }

  private publishFirebaseAccount(user: FirebaseUser | null): void {
    this.firebaseAccountState.set(
      user
        ? {
            uid: user.uid,
            email: user.email,
            emailVerified: user.emailVerified,
            google: user.providerData.some(
              ({ providerId }) => providerId === "google.com",
            ),
            password: user.providerData.some(
              ({ providerId }) => providerId === "password",
            ),
          }
        : null,
    );
  }

  private cancelFirebaseCommand(): void {
    this.firebaseCommand?.controller.abort();
    this.firebaseCommand = undefined;
    this.googleLinkProof.set(null);
  }

  private async signOutFirebase(): Promise<void> {
    if (this.signingOut) return this.signingOut;
    const pending = this.firebase.signOut();
    this.signingOut = pending;
    try {
      await pending;
    } finally {
      if (this.signingOut === pending) this.signingOut = undefined;
    }
  }

  private async clearCancelledFirebaseUser(
    command: FirebaseCommand,
  ): Promise<void> {
    if (
      command.controller.signal.aborted &&
      (!command.userId || !this.allowFirebaseEvents) &&
      (!this.firebaseCommand || this.firebaseCommand === command) &&
      command.uid &&
      this.firebase.auth()?.currentUser?.uid === command.uid
    ) {
      // Do not mask cancellation with a failed SDK sign-out. Local acceptance
      // remains disabled even if Firebase cannot clear its persisted user.
      await this.signOutFirebase().catch(() => {});
    }
  }

  private clearLocalState(preserveFirebaseAccount = false): void {
    this.firebaseUid = null;
    this.googleLinkProof.set(null);
    if (!preserveFirebaseAccount) this.publishFirebaseAccount(null);
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
