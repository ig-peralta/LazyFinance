import "@angular/compiler";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { AuthConfig } from "@lazyfinance/contracts";
import type { User as FirebaseUser } from "firebase/auth";
import { SsrCookieService } from "ngx-cookie-service-ssr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import { firebaseUser } from "../../../testing/firebase";
import { FirebaseService } from "../../services/firebase/firebase.service";
import { initializeServices } from "../../services/initializer";
import { AuthApi } from "./auth-api";
import { SessionService } from "./session.service";

const cookieName = "lazyfinance-session";

const first = {
  userId: "user-a",
  email: "first@example.com",
  name: "First user",
};

const second = {
  userId: "user-b",
  email: "second@example.com",
  name: "Second user",
};

const initialize = () => TestBed.runInInjectionContext(initializeServices);

function setup() {
  const firstUser = firebaseUser("firebase-a", "token-a");
  const secondUser = firebaseUser("firebase-b", "token-b");
  let initialized = false;
  let onTokenChanged: (user: FirebaseUser | null) => void = () => {};
  let onTokenError: () => void = () => {};
  const auth = {
    currentUser: firstUser.user as FirebaseUser | null,
    authStateReady: vi.fn(async () => {}),
    onIdTokenChanged: vi.fn(
      (listener: (user: FirebaseUser | null) => void, onError: () => void) => {
        onTokenChanged = listener;
        onTokenError = onError;
        queueMicrotask(() => listener(auth.currentUser));

        return () => {};
      },
    ),
  };
  const firebase = {
    init: vi.fn(async () => {
      initialized = true;
      return auth;
    }),
    auth: () => (initialized ? auth : null),
    signInWithGoogle: vi.fn<FirebaseService["signInWithGoogle"]>(async () => {
      auth.currentUser = firstUser.user;
      onTokenChanged(firstUser.user);
      return firstUser.user;
    }),
    signInWithPassword: vi.fn<FirebaseService["signInWithPassword"]>(
      async () => {
        auth.currentUser = firstUser.user;
        onTokenChanged(firstUser.user);
        return firstUser.user;
      },
    ),
    createPasswordAccount: vi.fn<FirebaseService["createPasswordAccount"]>(
      async () => {
        firstUser.user.emailVerified = false;
        firstUser.setProviders(["password"]);
        auth.currentUser = firstUser.user;
        onTokenChanged(firstUser.user);
        return firstUser.user;
      },
    ),
    sendVerification: vi.fn<FirebaseService["sendVerification"]>(
      async (user) => user,
    ),
    reloadUser: vi.fn<FirebaseService["reloadUser"]>(async (user) => user),
    resetPassword: vi.fn<FirebaseService["resetPassword"]>(async () => {}),
    reauthenticatePassword: vi.fn<FirebaseService["reauthenticatePassword"]>(
      async (user) => user,
    ),
    linkGoogle: vi.fn<FirebaseService["linkGoogle"]>(async () => {
      firstUser.setProviders(["password", "google.com"]);
      onTokenChanged(firstUser.user);
      return firstUser.user;
    }),
    linkPassword: vi.fn<FirebaseService["linkPassword"]>(async () => {
      firstUser.setProviders(["google.com", "password"]);
      onTokenChanged(firstUser.user);
      return firstUser.user;
    }),
    signOut: vi.fn(async () => {
      auth.currentUser = null;
      onTokenChanged(null);
    }),
  };
  const getAuthConfig = vi.fn(
    async (): Promise<AuthConfig> => ({ provider: "firebase" }),
  );
  const getPrincipal = vi.fn<
    (
      ...args: Parameters<AuthApi["verifyPrincipal"]>
    ) => Promise<Awaited<ReturnType<AuthApi["verifyPrincipal"]>>>
  >(async (token: string) => (token === "token-b" ? second : first));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthApi,
        useValue: { config: getAuthConfig, verifyPrincipal: getPrincipal },
      },
      { provide: FirebaseService, useValue: firebase },
    ],
  });
  const session = TestBed.inject(SessionService);

  return {
    session,
    firstUser,
    secondUser,
    auth,
    firebase,
    getPrincipal,
    onTokenChanged: (user: FirebaseUser | null) => onTokenChanged(user),
    onTokenError: () => onTokenError(),
  };
}

describe("Firebase browser session", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.cookie = `${cookieName}=; Max-Age=0; Path=/`;
    TestBed.resetTestingModule();
  });

  it("invalidates pending verification when the Firebase observer fails", async () => {
    const { session, firstUser, getPrincipal, onTokenChanged, onTokenError } =
      setup();
    await initialize();
    let complete!: (value: typeof first) => void;
    getPrincipal.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    firstUser.setToken("pending-token");
    onTokenChanged(firstUser.user);
    await vi.waitFor(() => expect(complete).toBeDefined());
    onTokenError();
    complete(first);
    await Promise.resolve();
    await Promise.resolve();
    expect(session.active()).toBe(false);
    expect(session.isResolving()).toBe(false);
  });

  it("restores the SDK user through the API and stores only the verified ID token for SSR", async () => {
    document.cookie = `${cookieName}=${encodeURIComponent(JSON.stringify({ token: "forged", user: second }))}; Path=/`;
    const { session, firebase, getPrincipal } = setup();
    await initialize();

    expect(firebase.init).toHaveBeenCalledOnce();
    expect(getPrincipal).toHaveBeenCalledExactlyOnceWith("token-a");
    expect(session.user()).toEqual(first);
    expect(session.active()).toBe(true);
    const cookie = TestBed.inject(SsrCookieService).get(cookieName);
    expect(JSON.parse(cookie)).toEqual({ token: "token-a" });
  });

  it("refreshes rotated ID tokens without switching to a stale account response", async () => {
    const {
      session,
      firstUser,
      secondUser,
      auth,
      getPrincipal,
      onTokenChanged,
    } = setup();
    await initialize();

    firstUser.setToken("token-a-refresh");
    onTokenChanged(firstUser.user);
    await vi.waitFor(() => expect(session.token()).toBe("token-a-refresh"));

    let completeOld!: (principal: typeof first) => void;
    getPrincipal.mockImplementation((token: string) =>
      token === "token-a-stale"
        ? new Promise<typeof first>((resolve) => {
            completeOld = resolve;
          })
        : Promise.resolve(token === "token-b" ? second : first),
    );
    firstUser.setToken("token-a-stale");
    onTokenChanged(firstUser.user);
    await vi.waitFor(() => expect(completeOld).toBeDefined());
    auth.currentUser = secondUser.user;
    onTokenChanged(secondUser.user);
    await vi.waitFor(() => expect(session.user()).toEqual(second));
    completeOld(first);
    await Promise.resolve();
    expect(session.token()).toBe("token-b");
    expect(
      JSON.parse(TestBed.inject(SsrCookieService).get(cookieName)),
    ).toEqual({
      token: "token-b",
    });
  });

  it("clears a rejected restored token and can recover after Firebase rotates it", async () => {
    const { session, firstUser, getPrincipal, onTokenChanged } = setup();
    getPrincipal.mockRejectedValueOnce(new Error("Expired token"));
    await initialize();
    expect(session.active()).toBe(false);
    expect(TestBed.inject(SsrCookieService).get(cookieName)).toBe("");

    firstUser.setToken("token-a-refresh");
    onTokenChanged(firstUser.user);
    await vi.waitFor(() => expect(session.user()).toEqual(first));
    expect(session.token()).toBe("token-a-refresh");
  });

  it("fails closed if app-wide Firebase initialization is unavailable", async () => {
    document.cookie = `${cookieName}=${encodeURIComponent(JSON.stringify({ token: "old-token" }))}; Path=/`;
    const { session, firebase, getPrincipal } = setup();
    firebase.init.mockRejectedValueOnce(
      new Error("Firebase Web config unavailable"),
    );
    await initialize();

    expect(session.isResolving()).toBe(false);
    expect(session.active()).toBe(false);
    expect(getPrincipal).not.toHaveBeenCalled();
    expect(TestBed.inject(SsrCookieService).get(cookieName)).toBe("");
  });

  it("finishes resolving when a Google popup and token observer race", async () => {
    const { session, secondUser, auth, firebase, onTokenChanged } = setup();
    await initialize();
    firebase.signInWithGoogle.mockImplementation(async () => {
      auth.currentUser = secondUser.user;
      onTokenChanged(secondUser.user);

      return secondUser.user;
    });

    await expect(session.loginWithGoogle()).resolves.toEqual(second);
    expect(session.isResolving()).toBe(false);
    expect(session.user()).toEqual(second);
  });

  it("clears browser state and the SSR cookie on Firebase sign-out", async () => {
    const { session, firebase } = setup();
    await initialize();
    await session.logout();

    expect(firebase.signOut).toHaveBeenCalledOnce();
    expect(session.active()).toBe(false);
    expect(TestBed.inject(SsrCookieService).get(cookieName)).toBe("");
  });

  it("does not accept observer tokens again when Firebase sign-out fails", async () => {
    const { session, firstUser, firebase, getPrincipal, onTokenChanged } =
      setup();
    await initialize();
    firebase.signOut.mockRejectedValueOnce(new Error("sign-out unavailable"));
    await expect(session.logout()).rejects.toThrow("sign-out unavailable");
    onTokenChanged(firstUser.user);
    expect(session.active()).toBe(false);
    expect(TestBed.inject(SsrCookieService).get(cookieName)).toBe("");
    expect(getPrincipal).toHaveBeenCalledOnce();
  });

  it("does not start another SDK login while sign-out is still pending", async () => {
    const { session, auth, firebase, onTokenChanged } = setup();
    await initialize();
    const pending = deferred<void>();
    firebase.signOut.mockImplementationOnce(async () => {
      await pending.promise;
      auth.currentUser = null;
      onTokenChanged(null);
    });
    const logout = session.logout();
    await expect(session.loginWithGoogle()).rejects.toThrow("still pending");
    expect(firebase.signInWithGoogle).not.toHaveBeenCalled();
    pending.resolve();
    await logout;
    await expect(session.loginWithGoogle()).resolves.toEqual(first);
  });

  it("does not restore a session from a late API response after logout", async () => {
    const { session, firstUser, getPrincipal, onTokenChanged } = setup();
    await initialize();
    let finish!: (principal: typeof first) => void;
    getPrincipal.mockImplementationOnce(
      () =>
        new Promise<typeof first>((resolve) => {
          finish = resolve;
        }),
    );
    firstUser.setToken("old-token");
    onTokenChanged(firstUser.user);
    await vi.waitFor(() => expect(finish).toBeDefined());

    await session.logout();
    finish(first);
    await Promise.resolve();
    expect(session.active()).toBe(false);
    expect(TestBed.inject(SsrCookieService).get(cookieName)).toBe("");
  });

  it("accepts a password login only after API verification, without trusting its email as an owner", async () => {
    const { session, auth, firstUser, firebase, getPrincipal } = setup();
    firstUser.setProviders(["password"]);
    auth.currentUser = null;
    await initialize();
    const pending = deferred<typeof first>();
    getPrincipal.mockReturnValueOnce(pending.promise);
    const login = session.loginWithPassword(
      "first@example.com",
      "test-password",
    );
    await vi.waitFor(() => expect(getPrincipal).toHaveBeenCalledOnce());

    expect(session.active()).toBe(false);
    expect(TestBed.inject(SsrCookieService).get(cookieName)).toBe("");
    pending.resolve(first);
    await expect(login).resolves.toEqual(first);
    expect(firebase.signInWithPassword).toHaveBeenCalledExactlyOnceWith(
      "first@example.com",
      "test-password",
    );
    expect(session.firebaseAccount()).toMatchObject({
      uid: firstUser.user.uid,
      password: true,
      google: false,
    });
    expect(
      JSON.parse(TestBed.inject(SsrCookieService).get(cookieName)),
    ).toEqual({ token: "token-a" });
  });

  it("registers an unverified password account without accepting a principal or writing an SSR token", async () => {
    const { session, auth, firstUser, firebase, getPrincipal } = setup();
    auth.currentUser = null;
    await initialize();
    await session.registerWithPassword("new@example.com", "test-password");

    expect(firebase.createPasswordAccount).toHaveBeenCalledExactlyOnceWith(
      "new@example.com",
      "test-password",
    );
    expect(firebase.sendVerification).toHaveBeenCalledWith(
      firstUser.user,
      expect.any(AbortSignal),
    );
    expect(getPrincipal).not.toHaveBeenCalled();
    expect(session.active()).toBe(false);
    expect(session.firebaseAccount()).toMatchObject({
      emailVerified: false,
      password: true,
    });
    expect(TestBed.inject(SsrCookieService).get(cookieName)).toBe("");
  });

  it("keeps a created account recoverable if sending verification fails", async () => {
    const { session, auth, firebase } = setup();
    auth.currentUser = null;
    await initialize();
    firebase.sendVerification.mockRejectedValueOnce(
      new Error("mail unavailable"),
    );

    await expect(
      session.registerWithPassword("new@example.com", "test-password"),
    ).rejects.toThrow("mail unavailable");
    expect(session.active()).toBe(false);
    expect(session.firebaseAccount()?.emailVerified).toBe(false);
    await expect(session.resendVerification()).resolves.toBeUndefined();
    expect(firebase.sendVerification).toHaveBeenCalledTimes(2);
  });

  it("reloads email verification and forces a fresh token before accepting the account", async () => {
    const { session, auth, firstUser, firebase, getPrincipal } = setup();
    auth.currentUser = null;
    await initialize();
    await session.registerWithPassword("new@example.com", "test-password");
    await expect(session.checkEmailVerification()).resolves.toBe(false);
    expect(getPrincipal).not.toHaveBeenCalled();

    firebase.reloadUser.mockImplementationOnce(async (user) => {
      firstUser.user.emailVerified = true;
      firstUser.setToken("verified-token");
      return user;
    });
    await expect(session.checkEmailVerification()).resolves.toBe(true);
    expect(firstUser.user.getIdToken).toHaveBeenCalledWith(true);
    expect(getPrincipal).toHaveBeenCalledExactlyOnceWith(
      "verified-token",
      expect.any(AbortSignal),
    );
    expect(session.user()).toEqual(first);
  });

  it("retains the verification UI but no principal when a new unverified login is rejected", async () => {
    const { session, auth, firstUser, getPrincipal } = setup();
    firstUser.user.emailVerified = false;
    firstUser.setProviders(["password"]);
    auth.currentUser = null;
    await initialize();
    getPrincipal.mockRejectedValueOnce(new Error("verified email required"));

    await expect(
      session.loginWithPassword("new@example.com", "test-password"),
    ).rejects.toThrow("verified email required");
    expect(session.firebaseAccount()?.emailVerified).toBe(false);
    expect(session.active()).toBe(false);
    expect(TestBed.inject(SsrCookieService).get(cookieName)).toBe("");
  });

  it("links a password on the same UID and internal owner without duplicate observer acceptance", async () => {
    const { session, firstUser, firebase, getPrincipal, onTokenChanged } =
      setup();
    await initialize();
    firstUser.setToken("linked-token");
    firstUser.user.getIdToken.mockImplementationOnce(async () => {
      onTokenChanged(firstUser.user);
      return "linked-token";
    });
    await session.linkPassword("test-password");

    expect(firebase.linkPassword).toHaveBeenCalledWith(
      firstUser.user,
      "test-password",
      expect.any(AbortSignal),
    );
    expect(getPrincipal).toHaveBeenCalledTimes(2);
    expect(session.user()?.userId).toBe(first.userId);
    expect(session.firebaseAccount()).toMatchObject({
      uid: firstUser.user.uid,
      google: true,
      password: true,
    });
    expect(session.token()).toBe("linked-token");
    expect(session.isResolving()).toBe(false);
  });

  it("requires successful password reauthentication before opening Google linking", async () => {
    const { session, firstUser, firebase } = setup();
    firstUser.setProviders(["password"]);
    await initialize();
    await expect(session.linkGoogle()).rejects.toThrow(
      "Confirm your current password",
    );
    firebase.reauthenticatePassword.mockRejectedValueOnce(
      new Error("wrong password"),
    );
    await expect(session.prepareGoogleLink("wrong")).rejects.toThrow(
      "wrong password",
    );
    expect(session.googleLinkReady()).toBe(false);
    expect(firebase.linkGoogle).not.toHaveBeenCalled();

    await session.prepareGoogleLink("correct-password");
    expect(session.googleLinkReady()).toBe(true);
    await session.linkGoogle();
    expect(session.googleLinkReady()).toBe(false);
    expect(firebase.linkGoogle).toHaveBeenCalledWith(
      firstUser.user,
      expect.any(AbortSignal),
    );
    expect(session.user()?.userId).toBe(first.userId);
    expect(session.firebaseAccount()?.google).toBe(true);
  });

  it("expires Google link proof at use even if its computed UI hint was already cached", async () => {
    const { session, firstUser, firebase } = setup();
    firstUser.setProviders(["password"]);
    await initialize();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    await session.prepareGoogleLink("test-password");
    expect(session.googleLinkReady()).toBe(true);
    clock.mockReturnValue(now + 5 * 60_000);

    await expect(session.linkGoogle()).rejects.toThrow(
      "Confirm your current password",
    );
    expect(firebase.linkGoogle).not.toHaveBeenCalled();
    expect(session.googleLinkReady()).toBe(false);
  });

  it("consumes Google link proof even when the popup fails", async () => {
    const { session, firstUser, firebase } = setup();
    firstUser.setProviders(["password"]);
    await initialize();
    await session.prepareGoogleLink("test-password");
    firebase.linkGoogle.mockRejectedValueOnce(new Error("popup cancelled"));
    await expect(session.linkGoogle()).rejects.toThrow("popup cancelled");
    await expect(session.linkGoogle()).rejects.toThrow(
      "Confirm your current password",
    );
    expect(firebase.linkGoogle).toHaveBeenCalledOnce();
    expect(session.active()).toBe(true);
  });

  it("fails closed if linking resolves a different application owner for the same UID", async () => {
    const { session, firstUser, getPrincipal, onTokenChanged } = setup();
    await initialize();
    getPrincipal.mockResolvedValueOnce(second);
    await expect(session.linkPassword("test-password")).rejects.toThrow(
      "application owner",
    );
    onTokenChanged(firstUser.user);

    expect(session.active()).toBe(false);
    expect(session.firebaseAccount()).toBeNull();
    expect(TestBed.inject(SsrCookieService).get(cookieName)).toBe("");
    expect(getPrincipal).toHaveBeenCalledTimes(2);
  });

  it("rejects an SDK link result that switches Firebase UID even without an observer notification", async () => {
    const { session, auth, secondUser, firebase } = setup();
    await initialize();
    firebase.linkPassword.mockImplementationOnce(async () => {
      auth.currentUser = secondUser.user;
      return secondUser.user;
    });
    await expect(session.linkPassword("test-password")).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(session.active()).toBe(false);
    expect(session.firebaseAccount()).toBeNull();
  });

  it("clears the old owner when an SDK guard rejects an unnoticed account switch before returning", async () => {
    const { session, auth, secondUser, firebase } = setup();
    await initialize();
    firebase.linkPassword.mockImplementationOnce(async () => {
      auth.currentUser = secondUser.user;
      throw new DOMException("Firebase user changed", "AbortError");
    });
    await expect(session.linkPassword("test-password")).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(session.active()).toBe(false);
    expect(session.firebaseAccount()).toBeNull();
    expect(TestBed.inject(SsrCookieService).get(cookieName)).toBe("");
  });

  it("keeps the SDK barrier until a late popup after logout has been signed out", async () => {
    const { session, auth, firstUser, firebase, onTokenChanged } = setup();
    auth.currentUser = null;
    await initialize();
    const pending = deferred<FirebaseUser>();
    firebase.signInWithGoogle.mockReturnValueOnce(pending.promise);
    const login = session.loginWithGoogle();
    const rejected = expect(login).rejects.toMatchObject({
      name: "AbortError",
    });
    await session.logout();
    await expect(session.loginWithGoogle()).rejects.toThrow("still pending");

    auth.currentUser = firstUser.user;
    onTokenChanged(firstUser.user);
    pending.resolve(firstUser.user);
    await rejected;
    expect(auth.currentUser).toBeNull();
    expect(session.active()).toBe(false);
    expect(firebase.signOut).toHaveBeenCalledTimes(2);
    await expect(session.loginWithGoogle()).resolves.toEqual(first);
  });

  it("cancels candidate API verification on component destruction and ignores later token events", async () => {
    const { session, auth, firstUser, firebase, getPrincipal, onTokenChanged } =
      setup();
    auth.currentUser = null;
    await initialize();
    const pending = deferred<typeof first>();
    getPrincipal.mockReturnValueOnce(pending.promise);
    const lifetime = new AbortController();
    const login = session.loginWithPassword(
      "first@example.com",
      "test-password",
      lifetime.signal,
    );
    const rejected = expect(login).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(getPrincipal).toHaveBeenCalledOnce());
    const candidateSignal = getPrincipal.mock.calls[0]?.[1];
    lifetime.abort();
    expect(candidateSignal?.aborted).toBe(true);
    pending.resolve(first);
    await rejected;
    onTokenChanged(firstUser.user);

    expect(firebase.signOut).toHaveBeenCalledOnce();
    expect(session.active()).toBe(false);
    expect(session.firebaseAccount()).toBeNull();
    expect(TestBed.inject(SsrCookieService).get(cookieName)).toBe("");
  });

  it("does not claim cancellation rolled back a credential already linked by Firebase", async () => {
    const { session, firstUser, firebase } = setup();
    await initialize();
    const pending = deferred<void>();
    firebase.linkPassword.mockImplementationOnce(
      async (user, _password, signal) => {
        await pending.promise;
        firstUser.setProviders(["google.com", "password"]);
        signal.throwIfAborted();
        return user;
      },
    );
    const lifetime = new AbortController();
    const linking = session.linkPassword("test-password", lifetime.signal);
    const rejected = expect(linking).rejects.toMatchObject({
      name: "AbortError",
    });
    lifetime.abort();
    pending.resolve();
    await rejected;

    expect(session.user()).toEqual(first);
    expect(session.firebaseAccount()?.password).toBe(true);
    expect(firebase.signOut).not.toHaveBeenCalled();
  });

  it("invalidates proof and pending reauthentication when the SDK account changes", async () => {
    const { session, firstUser, secondUser, auth, firebase, onTokenChanged } =
      setup();
    firstUser.setProviders(["password"]);
    await initialize();
    const pending = deferred<FirebaseUser>();
    firebase.reauthenticatePassword.mockReturnValueOnce(pending.promise);
    const preparing = session.prepareGoogleLink("test-password");
    const rejected = expect(preparing).rejects.toMatchObject({
      name: "AbortError",
    });
    auth.currentUser = secondUser.user;
    onTokenChanged(secondUser.user);
    pending.resolve(firstUser.user);
    await rejected;

    expect(session.active()).toBe(false);
    expect(session.googleLinkReady()).toBe(false);
    expect(firebase.linkGoogle).not.toHaveBeenCalled();
    expect(firebase.signOut).not.toHaveBeenCalled();
  });

  it("clears a late authenticated link result after logout without accepting its methods", async () => {
    const { session, firstUser, auth, firebase } = setup();
    await initialize();
    const pending = deferred<void>();
    firebase.linkPassword.mockImplementationOnce(
      async (user, _password, signal) => {
        await pending.promise;
        auth.currentUser = user;
        firstUser.setProviders(["google.com", "password"]);
        signal.throwIfAborted();
        return user;
      },
    );
    const linking = session.linkPassword("test-password");
    const rejected = expect(linking).rejects.toMatchObject({
      name: "AbortError",
    });
    await session.logout();
    pending.resolve();
    await rejected;

    expect(auth.currentUser).toBeNull();
    expect(session.active()).toBe(false);
    expect(session.firebaseAccount()).toBeNull();
    expect(firebase.signOut).toHaveBeenCalledTimes(2);
  });
});
