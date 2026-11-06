import "@angular/compiler";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { AuthConfig } from "@lazyfinance/contracts";
import type { User as FirebaseUser } from "firebase/auth";
import { SsrCookieService } from "ngx-cookie-service-ssr";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function firebaseUser(uid: string, token: string) {
  let currentToken = token;
  return {
    user: {
      uid,
      getIdToken: vi.fn(async () => currentToken),
    } as unknown as FirebaseUser,
    setToken: (next: string) => {
      currentToken = next;
    },
  };
}

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
    signInWithGoogle: vi.fn(async () => auth.currentUser!),
    signOut: vi.fn(async () => {
      auth.currentUser = null;
      onTokenChanged(null);
    }),
  };
  const getAuthConfig = vi.fn(
    async (): Promise<AuthConfig> => ({ provider: "firebase" }),
  );
  const getPrincipal = vi.fn(async (token: string) =>
    token === "token-b" ? second : first,
  );
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
});
