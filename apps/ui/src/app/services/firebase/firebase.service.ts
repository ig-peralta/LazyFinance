import { isPlatformServer } from "@angular/common";
import { Injectable, inject, PLATFORM_ID } from "@angular/core";
import type { Auth, User } from "firebase/auth";
import { environment } from "../../../environments/environment";

@Injectable({ providedIn: "root" })
export class FirebaseService {
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private authInstance: Auth | null = null;
  private sdk?: typeof import("firebase/auth");
  private initialization?: Promise<Auth>;

  auth(): Auth | null {
    return this.authInstance;
  }

  init(): Promise<Auth> {
    if (this.isServer)
      return Promise.reject(
        new Error("Firebase Auth is only available in the browser"),
      );
    this.initialization ??= this.initializeBrowser().catch((error: unknown) => {
      this.initialization = undefined;
      throw error;
    });
    return this.initialization;
  }

  private async initializeBrowser(): Promise<Auth> {
    const config = environment.firebaseConfig;
    if (
      Object.values(config).some(
        (value) => !value || value.startsWith("REPLACE_WITH_"),
      )
    )
      throw new Error("Firebase Web configuration is missing");

    // Public prerendering and the eager frame never need to download the SDK.
    const [{ getApps, initializeApp }, sdk] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
    ]);
    const app =
      getApps().find(({ name }) => name === "lazyfinance-browser") ??
      initializeApp(config, "lazyfinance-browser");
    const auth = sdk.getAuth(app);
    await sdk.setPersistence(auth, sdk.browserLocalPersistence);
    this.sdk = sdk;
    this.authInstance = auth;
    return auth;
  }

  async signInWithGoogle(): Promise<User> {
    const auth = await this.init();
    return (
      await this.requireSdk().signInWithPopup(auth, this.googleProvider())
    ).user;
  }

  async signInWithPassword(email: string, password: string): Promise<User> {
    const auth = await this.init();
    return (
      await this.requireSdk().signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      )
    ).user;
  }

  async createPasswordAccount(email: string, password: string): Promise<User> {
    const auth = await this.init();
    return (
      await this.requireSdk().createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      )
    ).user;
  }

  async sendVerification(user: User, signal: AbortSignal): Promise<User> {
    this.assertCurrentUser(user, signal);
    await this.requireSdk().sendEmailVerification(user);
    this.assertCurrentUser(user, signal);
    return user;
  }

  async reloadUser(user: User, signal: AbortSignal): Promise<User> {
    this.assertCurrentUser(user, signal);
    await this.requireSdk().reload(user);
    this.assertCurrentUser(user, signal);
    return user;
  }

  async resetPassword(email: string): Promise<void> {
    const auth = await this.init();
    try {
      await this.requireSdk().sendPasswordResetEmail(auth, email.trim());
    } catch (error) {
      // Display policy only: don't enumerate accounts, including without project protection.
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "auth/user-not-found"
      )
        return;
      throw error;
    }
  }

  async reauthenticatePassword(
    user: User,
    password: string,
    signal: AbortSignal,
  ): Promise<User> {
    this.assertCurrentUser(user, signal);
    if (
      !user.email ||
      !user.providerData.some(({ providerId }) => providerId === "password")
    )
      throw new Error("A password sign-in method is required");

    const sdk = this.requireSdk();
    await sdk.reauthenticateWithCredential(
      user,
      sdk.EmailAuthProvider.credential(user.email, password),
    );
    this.assertCurrentUser(user, signal);
    return user;
  }

  async linkGoogle(user: User, signal: AbortSignal): Promise<User> {
    this.assertCurrentUser(user, signal);
    // Already initialized: preserve the fresh popup gesture after password confirmation.
    const result = await this.requireSdk().linkWithPopup(
      user,
      this.googleProvider(),
    );
    this.assertCurrentUser(user, signal);
    if (result.user.uid !== user.uid)
      throw new Error("Linking changed the Firebase user");
    return result.user;
  }

  async linkPassword(
    user: User,
    password: string,
    signal: AbortSignal,
  ): Promise<User> {
    this.assertCurrentUser(user, signal);
    if (
      !user.email ||
      !user.emailVerified ||
      !user.providerData.some(
        ({ providerId }) => providerId === "google.com",
      ) ||
      user.providerData.some(({ providerId }) => providerId === "password")
    )
      throw new Error(
        "A verified Google account without a password is required",
      );

    const sdk = this.requireSdk();
    const confirmed = await sdk.reauthenticateWithPopup(
      user,
      this.googleProvider(),
    );
    this.assertCurrentUser(user, signal);
    if (confirmed.user.uid !== user.uid)
      throw new Error("Reauthentication changed the Firebase user");
    const result = await sdk.linkWithCredential(
      user,
      sdk.EmailAuthProvider.credential(user.email, password),
    );
    this.assertCurrentUser(user, signal);
    if (result.user.uid !== user.uid)
      throw new Error("Linking changed the Firebase user");
    return result.user;
  }

  private assertCurrentUser(user: User, signal: AbortSignal): void {
    signal.throwIfAborted();
    if (this.isServer || this.authInstance?.currentUser?.uid !== user.uid)
      throw new DOMException("Firebase user changed", "AbortError");
  }

  private requireSdk(): typeof import("firebase/auth") {
    if (!this.sdk) throw new Error("Firebase Auth is not initialized");
    return this.sdk;
  }

  private googleProvider() {
    const provider = new (this.requireSdk().GoogleAuthProvider)();
    provider.setCustomParameters({ prompt: "select_account" });
    return provider;
  }

  async signOut(): Promise<void> {
    if (this.authInstance) await this.authInstance.signOut();
  }
}
