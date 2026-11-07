import { isPlatformServer } from "@angular/common";
import { Injectable, inject, PLATFORM_ID } from "@angular/core";
import { FirebaseError, getApps, initializeApp } from "firebase/app";
import {
  type Auth,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  getAuth,
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  type User,
} from "firebase/auth";
import { environment } from "../../../environments/environment";

function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

@Injectable({ providedIn: "root" })
export class FirebaseService {
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private authInstance: Auth | null = null;

  auth(): Auth | null {
    return this.authInstance;
  }

  async init(): Promise<Auth> {
    if (this.isServer)
      throw new Error("Firebase Auth is only available in the browser");
    if (this.authInstance) return this.authInstance;

    const config = environment.firebaseConfig;
    if (
      Object.values(config).some(
        (value) => !value || value.startsWith("REPLACE_WITH_"),
      )
    ) {
      throw new Error("Firebase Web configuration is missing");
    }

    const app =
      getApps().find(({ name }) => name === "lazyfinance-browser") ??
      initializeApp(config, "lazyfinance-browser");
    const auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence);
    this.authInstance = auth;

    return auth;
  }

  async signInWithGoogle(): Promise<User> {
    const auth = await this.init();
    return (await signInWithPopup(auth, googleProvider())).user;
  }

  async signInWithPassword(email: string, password: string): Promise<User> {
    return (
      await signInWithEmailAndPassword(
        await this.init(),
        email.trim(),
        password,
      )
    ).user;
  }

  async createPasswordAccount(email: string, password: string): Promise<User> {
    return (
      await createUserWithEmailAndPassword(
        await this.init(),
        email.trim(),
        password,
      )
    ).user;
  }

  async sendVerification(user: User, signal: AbortSignal): Promise<User> {
    this.assertCurrentUser(user, signal);
    await sendEmailVerification(user);
    this.assertCurrentUser(user, signal);
    return user;
  }

  async reloadUser(user: User, signal: AbortSignal): Promise<User> {
    this.assertCurrentUser(user, signal);
    await reload(user);
    this.assertCurrentUser(user, signal);
    return user;
  }

  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(await this.init(), email.trim());
    } catch (error) {
      // Also keep the UI response generic on projects without enumeration protection.
      if (
        error instanceof FirebaseError &&
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
    ) {
      throw new Error("A password sign-in method is required");
    }

    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, password),
    );
    this.assertCurrentUser(user, signal);
    return user;
  }

  async linkGoogle(user: User, signal: AbortSignal): Promise<User> {
    this.assertCurrentUser(user, signal);
    // Called from a fresh user gesture, after the existing password was verified.
    const result = await linkWithPopup(user, googleProvider());
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
    ) {
      throw new Error(
        "A verified Google account without a password is required",
      );
    }

    // Prove control of the existing account before adding another credential.
    const confirmed = await reauthenticateWithPopup(user, googleProvider());
    this.assertCurrentUser(user, signal);
    if (confirmed.user.uid !== user.uid)
      throw new Error("Reauthentication changed the Firebase user");
    const result = await linkWithCredential(
      user,
      EmailAuthProvider.credential(user.email, password),
    );
    this.assertCurrentUser(user, signal);
    if (result.user.uid !== user.uid)
      throw new Error("Linking changed the Firebase user");
    return result.user;
  }

  private assertCurrentUser(user: User, signal: AbortSignal): void {
    signal.throwIfAborted();
    if (this.isServer || this.authInstance?.currentUser?.uid !== user.uid) {
      throw new DOMException("Firebase user changed", "AbortError");
    }
  }

  async signOut(): Promise<void> {
    if (this.authInstance) await this.authInstance.signOut();
  }
}
