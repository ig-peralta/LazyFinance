import "@angular/compiler";
import { TestBed } from "@angular/core/testing";
import { deleteApp, FirebaseError, getApps, initializeApp } from "firebase/app";
import {
  type Auth,
  browserLocalPersistence,
  EmailAuthProvider,
  GoogleAuthProvider,
  type User,
  type UserCredential,
} from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vitest } from "vitest";
import { deferred } from "../../../testing/deferred";
import { firebaseUser } from "../../../testing/firebase";
import { FirebaseService } from "./firebase.service";

// Angular bundles the helper's `vi` import into this entry and renames another
// `vi` to `vi2`, which Vitest cannot hoist. Keep the recognized name distinct.
const sdk = vitest.hoisted(() => ({
  getAuth: vitest.fn<typeof import("firebase/auth").getAuth>(),
  setPersistence: vitest.fn<typeof import("firebase/auth").setPersistence>(),
  signInWithPopup: vitest.fn<typeof import("firebase/auth").signInWithPopup>(),
  signInWithEmailAndPassword:
    vitest.fn<typeof import("firebase/auth").signInWithEmailAndPassword>(),
  createUserWithEmailAndPassword:
    vitest.fn<typeof import("firebase/auth").createUserWithEmailAndPassword>(),
  sendEmailVerification:
    vitest.fn<typeof import("firebase/auth").sendEmailVerification>(),
  sendPasswordResetEmail:
    vitest.fn<typeof import("firebase/auth").sendPasswordResetEmail>(),
  reload: vitest.fn<typeof import("firebase/auth").reload>(),
  reauthenticateWithCredential:
    vitest.fn<typeof import("firebase/auth").reauthenticateWithCredential>(),
  reauthenticateWithPopup:
    vitest.fn<typeof import("firebase/auth").reauthenticateWithPopup>(),
  linkWithCredential:
    vitest.fn<typeof import("firebase/auth").linkWithCredential>(),
  linkWithPopup: vitest.fn<typeof import("firebase/auth").linkWithPopup>(),
}));

// Avoid emitted object-spread helpers here: hoisting can run this factory before
// Angular's generated helper declarations have initialized.
vitest.mock("firebase/auth", async (importOriginal) =>
  Object.assign(
    {},
    await importOriginal<typeof import("firebase/auth")>(),
    sdk,
  ),
);

const network = vitest.fn<typeof fetch>();

function result(
  user: User,
  operationType: UserCredential["operationType"] = "link",
): UserCredential {
  return { user, providerId: "google.com", operationType };
}

async function setup(providers = ["google.com"]) {
  const fixture = firebaseUser("firebase-a", "token-a", providers);
  const app = initializeApp(
    { apiKey: "fixture-key", projectId: "fixture" },
    "lazyfinance-browser",
  );
  const unexpected = () => {
    throw new Error("Unexpected Auth instance operation");
  };
  const auth = {
    app,
    name: app.name,
    config: {
      apiKey: "fixture-key",
      apiHost: "unused.example.test",
      apiScheme: "https",
      tokenApiHost: "unused.example.test",
      sdkClientVersion: "fixture",
    },
    languageCode: null,
    tenantId: null,
    settings: { appVerificationDisabledForTesting: false },
    emulatorConfig: null,
    currentUser: fixture.user as User | null,
    setPersistence: vitest.fn<Auth["setPersistence"]>(unexpected),
    onAuthStateChanged: vitest.fn<Auth["onAuthStateChanged"]>(unexpected),
    beforeAuthStateChanged:
      vitest.fn<Auth["beforeAuthStateChanged"]>(unexpected),
    onIdTokenChanged: vitest.fn<Auth["onIdTokenChanged"]>(unexpected),
    authStateReady: vitest.fn<Auth["authStateReady"]>(unexpected),
    updateCurrentUser: vitest.fn<Auth["updateCurrentUser"]>(unexpected),
    useDeviceLanguage: vitest.fn<Auth["useDeviceLanguage"]>(unexpected),
    signOut: vitest.fn<Auth["signOut"]>(async () => {}),
  } satisfies Auth;
  sdk.getAuth.mockReturnValue(auth);
  sdk.setPersistence.mockResolvedValue();
  sdk.reauthenticateWithCredential.mockResolvedValue(
    result(fixture.user, "reauthenticate"),
  );
  sdk.reauthenticateWithPopup.mockResolvedValue(
    result(fixture.user, "reauthenticate"),
  );
  sdk.linkWithCredential.mockResolvedValue(result(fixture.user));
  sdk.linkWithPopup.mockResolvedValue(result(fixture.user));
  sdk.signInWithEmailAndPassword.mockResolvedValue(
    result(fixture.user, "signIn"),
  );
  sdk.createUserWithEmailAndPassword.mockResolvedValue(
    result(fixture.user, "signIn"),
  );
  sdk.sendEmailVerification.mockResolvedValue();
  sdk.sendPasswordResetEmail.mockResolvedValue();
  sdk.reload.mockResolvedValue();
  const service = TestBed.inject(FirebaseService);
  await service.init();
  expect(
    service.auth() === auth,
    "FirebaseService must use the mocked Auth instance",
  ).toBe(true);
  expect(sdk.getAuth).toHaveBeenCalledExactlyOnceWith(app);
  return { ...fixture, service, auth, signal: new AbortController().signal };
}

describe("Firebase credential operations (mocked SDK)", () => {
  beforeEach(() => {
    vitest.resetAllMocks();
    network.mockRejectedValue(
      new Error("Unexpected network request in a Firebase SDK unit test"),
    );
    vitest.stubGlobal("fetch", network);
  });

  afterEach(async () => {
    try {
      TestBed.resetTestingModule();
      await Promise.all(
        getApps()
          .filter(({ name }) => name === "lazyfinance-browser")
          .map(deleteApp),
      );
      expect(network).not.toHaveBeenCalled();
    } finally {
      vitest.unstubAllGlobals();
    }
  });

  it("initializes the mocked SDK once without contacting Firebase", async () => {
    const { service, auth } = await setup();
    await expect(service.init()).resolves.toBe(auth);
    expect(sdk.getAuth).toHaveBeenCalledTimes(1);
    expect(sdk.setPersistence).toHaveBeenCalledExactlyOnceWith(
      auth,
      browserLocalPersistence,
    );
  });

  it("delegates password login and registration directly to Firebase, trimming only the email", async () => {
    const { service, auth, user } = await setup();
    await expect(
      service.signInWithPassword(" person@example.com ", " password "),
    ).resolves.toBe(user);
    await expect(
      service.createPasswordAccount(" person@example.com ", " new-password "),
    ).resolves.toBe(user);
    expect(sdk.signInWithEmailAndPassword).toHaveBeenCalledExactlyOnceWith(
      auth,
      "person@example.com",
      " password ",
    );
    expect(sdk.createUserWithEmailAndPassword).toHaveBeenCalledExactlyOnceWith(
      auth,
      "person@example.com",
      " new-password ",
    );
  });

  it("uses the same generic reset result for a missing account but preserves operational failures", async () => {
    const { service } = await setup();
    sdk.sendPasswordResetEmail.mockRejectedValueOnce(
      new FirebaseError("auth/user-not-found", "private email"),
    );
    await expect(
      service.resetPassword(" missing@example.com "),
    ).resolves.toBeUndefined();
    expect(sdk.sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.anything(),
      "missing@example.com",
    );
    const limited = new FirebaseError(
      "auth/too-many-requests",
      "private detail",
    );
    sdk.sendPasswordResetEmail.mockRejectedValueOnce(limited);
    await expect(service.resetPassword("person@example.com")).rejects.toBe(
      limited,
    );
  });

  it("does not send verification or reload for a stale Firebase user", async () => {
    const { service, auth, user, signal } = await setup();
    auth.currentUser = firebaseUser("other", "other-token").user;
    await expect(service.sendVerification(user, signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(service.reloadUser(user, signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(sdk.sendEmailVerification).not.toHaveBeenCalled();
    expect(sdk.reload).not.toHaveBeenCalled();
  });

  it("checks verification ownership again after the non-abortable SDK request", async () => {
    const { service, auth, user, signal } = await setup();
    sdk.sendEmailVerification.mockImplementationOnce(async () => {
      auth.currentUser = null;
    });
    await expect(service.sendVerification(user, signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(sdk.sendEmailVerification).toHaveBeenCalledExactlyOnceWith(user);
  });

  it("reauthenticates with the existing user's password rather than signing into another account", async () => {
    const { service, user, signal } = await setup(["password"]);
    await service.reauthenticatePassword(user, "current-password", signal);
    expect(sdk.reauthenticateWithCredential).toHaveBeenCalledExactlyOnceWith(
      user,
      EmailAuthProvider.credential(user.email, "current-password"),
    );
    expect(sdk.signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it("requires fresh Google reauthentication before adding a password", async () => {
    const { service, user, signal } = await setup();
    const pending = deferred<UserCredential>();
    sdk.reauthenticateWithPopup.mockReturnValueOnce(pending.promise);
    const linking = service.linkPassword(user, "new-password", signal);
    expect(sdk.linkWithCredential).not.toHaveBeenCalled();
    const provider = sdk.reauthenticateWithPopup.mock.calls[0]?.[1];
    expect(provider).toBeInstanceOf(GoogleAuthProvider);
    if (provider instanceof GoogleAuthProvider)
      expect(provider.getCustomParameters()).toEqual({
        prompt: "select_account",
      });

    pending.resolve(result(user, "reauthenticate"));
    await expect(linking).resolves.toBe(user);
    expect(sdk.linkWithCredential).toHaveBeenCalledExactlyOnceWith(
      user,
      EmailAuthProvider.credential(user.email, "new-password"),
    );
    expect(sdk.createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it.each([
    "unverified",
    "already-linked",
    "no-google",
  ])("refuses password linking for an ineligible account: %s", async (scenario) => {
    const { service, user, signal, setProviders } = await setup();
    if (scenario === "unverified") user.emailVerified = false;
    if (scenario === "already-linked") setProviders(["google.com", "password"]);
    if (scenario === "no-google") setProviders(["password"]);
    await expect(
      service.linkPassword(user, "new-password", signal),
    ).rejects.toThrow("verified Google account");
    expect(sdk.reauthenticateWithPopup).not.toHaveBeenCalled();
    expect(sdk.linkWithCredential).not.toHaveBeenCalled();
  });

  it("stops before adding credentials if the component is destroyed during Google reauthentication", async () => {
    const { service, user } = await setup();
    const lifetime = new AbortController();
    sdk.reauthenticateWithPopup.mockImplementationOnce(async () => {
      lifetime.abort();
      return result(user, "reauthenticate");
    });
    await expect(
      service.linkPassword(user, "new-password", lifetime.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(sdk.reauthenticateWithPopup).toHaveBeenCalledExactlyOnceWith(
      user,
      expect.any(GoogleAuthProvider),
    );
    expect(sdk.linkWithCredential).not.toHaveBeenCalled();
  });

  it("stops before adding credentials when reauthentication returns a different subject", async () => {
    const { service, user, signal } = await setup();
    sdk.reauthenticateWithPopup.mockResolvedValueOnce(
      result(firebaseUser("other", "other-token").user, "reauthenticate"),
    );
    await expect(
      service.linkPassword(user, "new-password", signal),
    ).rejects.toThrow("Reauthentication changed");
    expect(sdk.linkWithCredential).not.toHaveBeenCalled();
  });

  it("stops before adding credentials when the browser user changes during reauthentication", async () => {
    const { service, auth, user, signal } = await setup();
    sdk.reauthenticateWithPopup.mockImplementationOnce(async () => {
      auth.currentUser = firebaseUser("other", "other-token").user;
      return result(user, "reauthenticate");
    });
    await expect(
      service.linkPassword(user, "new-password", signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(sdk.reauthenticateWithPopup).toHaveBeenCalledExactlyOnceWith(
      user,
      expect.any(GoogleAuthProvider),
    );
    expect(sdk.linkWithCredential).not.toHaveBeenCalled();
  });

  it("links Google to the existing UID using a popup, never a sign-in or credential-transfer fallback", async () => {
    const { service, user, signal } = await setup(["password"]);
    await expect(service.linkGoogle(user, signal)).resolves.toBe(user);
    expect(sdk.linkWithPopup).toHaveBeenCalledExactlyOnceWith(
      user,
      expect.any(GoogleAuthProvider),
    );
    expect(sdk.signInWithPopup).not.toHaveBeenCalled();
    const collision = new FirebaseError(
      "auth/credential-already-in-use",
      "another account",
    );
    sdk.linkWithPopup.mockRejectedValueOnce(collision);
    await expect(service.linkGoogle(user, signal)).rejects.toBe(collision);
    expect(sdk.linkWithCredential).not.toHaveBeenCalled();
  });

  it("rejects a linking result with another UID", async () => {
    const { service, user, signal } = await setup(["password"]);
    sdk.linkWithPopup.mockResolvedValueOnce(
      result(firebaseUser("other", "other-token").user),
    );
    await expect(service.linkGoogle(user, signal)).rejects.toThrow(
      "Linking changed",
    );
  });
});
