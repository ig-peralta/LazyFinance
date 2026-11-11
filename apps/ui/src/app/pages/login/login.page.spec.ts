import "@angular/compiler";
import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from "@angular/router";
import { FirebaseError } from "firebase/app";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import { AuthApi } from "../../core/auth/auth-api";
import {
  type FirebaseAccount,
  SessionService,
} from "../../core/auth/session.service";
import { LoginPage } from "./login.page";

const principal = {
  userId: "demo-user",
  email: "demo@lazyfinance.cl",
  name: "Camila Rojas",
};

function setup(
  provider: "firebase" | "mock" = "mock",
  failConfig = false,
  activeSession = false,
  redirect?: string,
) {
  const active = signal(activeSession);
  const user = signal<typeof principal | null>(
    activeSession ? principal : null,
  );
  const firebaseAccount = signal<FirebaseAccount | null>(
    activeSession && provider === "firebase"
      ? {
          uid: "firebase-a",
          email: principal.email,
          emailVerified: true,
          google: true,
          password: false,
        }
      : null,
  );
  const isResolving = signal(false);
  const loginWithToken = vi.fn<SessionService["loginWithToken"]>(async () => {
    user.set(principal);
    active.set(true);

    return principal;
  });
  const clear = vi.fn(() => {
    user.set(null);
    active.set(false);
    firebaseAccount.set(null);
  });
  const logout = vi.fn(async () => clear());
  const loginWithGoogle = vi.fn<SessionService["loginWithGoogle"]>(async () => {
    user.set(principal);
    active.set(true);

    return principal;
  });
  const loginWithPassword = vi.fn<SessionService["loginWithPassword"]>(
    async () => {
      user.set(principal);
      active.set(true);
      return principal;
    },
  );
  const registerWithPassword = vi.fn<SessionService["registerWithPassword"]>(
    async (email) => {
      firebaseAccount.set({
        uid: "firebase-a",
        email,
        emailVerified: false,
        password: true,
        google: false,
      });
    },
  );
  const resendVerification = vi.fn<SessionService["resendVerification"]>(
    async () => {},
  );
  const checkEmailVerification = vi.fn<
    SessionService["checkEmailVerification"]
  >(async () => {
    firebaseAccount.update(
      (account) => account && { ...account, emailVerified: true },
    );
    user.set(principal);
    active.set(true);
    return true;
  });
  const resetPassword = vi.fn<SessionService["resetPassword"]>(async () => {});
  const getAuthConfig = vi.fn(async () => {
    if (failConfig) throw new Error("offline");

    return { provider };
  });
  const selectedProvider = signal<"firebase" | "mock" | null>(null);
  const sessionError = signal<string | null>(null);
  const start = vi.fn(async () => {
    isResolving.set(true);
    try {
      selectedProvider.set((await getAuthConfig()).provider);
    } catch {
      sessionError.set("No se pudieron cargar las opciones de acceso.");
    } finally {
      isResolving.set(false);
    }
  });
  const loginMock = vi.fn(async () => ({ token: "mock-session-token" }));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: convertToParamMap(redirect ? { redirect } : {}),
          },
        },
      },
      {
        provide: SessionService,
        useValue: {
          active,
          user,
          firebaseAccount,
          isResolving,
          provider: selectedProvider,
          error: sessionError,
          start,
          retry: start,
          loginWithToken,
          loginWithGoogle,
          loginWithPassword,
          registerWithPassword,
          resendVerification,
          checkEmailVerification,
          resetPassword,
          clear,
          logout,
        },
      },
      { provide: AuthApi, useValue: { config: getAuthConfig, loginMock } },
    ],
  });
  const navigate = vi
    .spyOn(TestBed.inject(Router), "navigateByUrl")
    .mockResolvedValue(true);
  const fixture = TestBed.createComponent(LoginPage);
  fixture.detectChanges();

  return {
    fixture,
    active,
    user,
    firebaseAccount,
    isResolving,
    loginWithToken,
    loginWithGoogle,
    loginWithPassword,
    registerWithPassword,
    resendVerification,
    checkEmailVerification,
    resetPassword,
    clear,
    logout,
    getAuthConfig,
    loginMock,
    navigate,
  };
}

describe("LoginPage", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("shows mock credentials only in mock mode and logs in using the returned token", async () => {
    const { fixture, loginMock, loginWithToken, navigate, clear, logout } =
      setup();
    await fixture.whenStable();
    fixture.detectChanges();

    const email = fixture.nativeElement.querySelector(
      "#email",
    ) as HTMLInputElement;
    const password = fixture.nativeElement.querySelector(
      "#password",
    ) as HTMLInputElement;
    expect(email.disabled).toBe(false);
    expect(password.disabled).toBe(false);
    expect(
      fixture.nativeElement.querySelector('[data-testid="google-login"]'),
    ).toBeNull();

    password.value = "password";
    (
      fixture.nativeElement.querySelector("form") as HTMLFormElement
    ).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(loginMock).toHaveBeenCalledWith(
      email.value,
      "password",
      expect.any(AbortSignal),
    );
    expect(loginWithToken).toHaveBeenCalledExactlyOnceWith(
      "mock-session-token",
      expect.any(AbortSignal),
    );
    expect(navigate).toHaveBeenCalledWith("/asistente");
    expect(fixture.nativeElement.textContent).toContain(principal.name);

    (
      fixture.nativeElement.querySelector(
        '[data-testid="logout"]',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(logout).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
  });

  it("offers Google and password sign-in instead of demo credentials in Firebase mode", async () => {
    const { fixture, loginMock, loginWithToken, loginWithGoogle, navigate } =
      setup("firebase");
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector("#email")).toBeNull();
    expect(fixture.nativeElement.querySelector("#password")).toBeNull();
    expect(
      fixture.nativeElement.querySelector("#firebase-email"),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector("#firebase-password"),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="mock-login"]'),
    ).toBeNull();
    const google = fixture.nativeElement.querySelector(
      '[data-testid="google-login"]',
    ) as HTMLButtonElement;
    expect(google.disabled).toBe(false);
    await fixture.componentInstance.loginWithMock(
      "demo@lazyfinance.cl",
      "password",
    );
    expect(loginMock).not.toHaveBeenCalled();
    expect(loginWithToken).not.toHaveBeenCalled();
    google.click();
    await fixture.whenStable();
    expect(loginWithGoogle).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/asistente");
  });

  it("preserves a restored Firebase session on the login page", async () => {
    const { fixture, clear } = setup("firebase", false, true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(clear).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(principal.name);
  });

  it("returns a restored Firebase user to a protected deep link", async () => {
    const { fixture, navigate } = setup("firebase", false, true, "/etiquetas");
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(navigate).toHaveBeenCalledWith("/etiquetas");
    });
  });

  it.each([
    "mock",
    "firebase",
  ] as const)("never redirects a restored %s account out of embedded MCP sign-in", async (provider) => {
    const { fixture, navigate, loginMock, loginWithGoogle } = setup(
      provider,
      false,
      true,
      "/dashboard",
    );
    fixture.componentRef.setInput("mcpMode", true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(loginMock).not.toHaveBeenCalled();
    expect(loginWithGoogle).not.toHaveBeenCalled();
  });

  it("does not establish a session when mock login is rejected", async () => {
    const { fixture, loginMock, loginWithToken } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    loginMock.mockRejectedValueOnce(new Error("invalid credentials"));

    const password = fixture.nativeElement.querySelector(
      "#password",
    ) as HTMLInputElement;
    password.value = "wrong";
    (
      fixture.nativeElement.querySelector("form") as HTMLFormElement
    ).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(loginWithToken).not.toHaveBeenCalled();
    expect(
      fixture.nativeElement.querySelector('[role="alert"]'),
    ).not.toBeNull();
  });

  it("does not render mock inputs when provider discovery fails", async () => {
    const { fixture } = setup("mock", true);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector("#email")).toBeNull();
    expect(fixture.nativeElement.querySelector("form")).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[role="alert"]'),
    ).not.toBeNull();
  });

  it("clears password fields before sign-in and navigates only once to a protected deep link", async () => {
    const { fixture, loginWithPassword, navigate } = setup(
      "firebase",
      false,
      false,
      "/etiquetas",
    );
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const email = root.querySelector("#firebase-email") as HTMLInputElement;
    const password = root.querySelector(
      "#firebase-password",
    ) as HTMLInputElement;
    const confirmation = root.querySelector(
      "#firebase-confirmation",
    ) as HTMLInputElement;
    email.value = "person@example.com";
    password.value = "test-password";
    const command = fixture.componentInstance.submitPassword(
      new Event("submit"),
      email,
      password,
      confirmation,
    );
    expect(password.value).toBe("");
    await command;
    await fixture.whenStable();

    expect(loginWithPassword).toHaveBeenCalledExactlyOnceWith(
      "person@example.com",
      "test-password",
      expect.any(AbortSignal),
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/etiquetas");
  });

  it("registers without navigating, then offers verification resend and recheck", async () => {
    const {
      fixture,
      registerWithPassword,
      resendVerification,
      checkEmailVerification,
      navigate,
    } = setup("firebase");
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.componentInstance.setPasswordMode("register");
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const email = root.querySelector("#firebase-email") as HTMLInputElement;
    const password = root.querySelector(
      "#firebase-password",
    ) as HTMLInputElement;
    const confirmation = root.querySelector(
      "#firebase-confirmation",
    ) as HTMLInputElement;
    email.value = "person@example.com";
    password.value = confirmation.value = "test-password";
    await fixture.componentInstance.submitPassword(
      new Event("submit"),
      email,
      password,
      confirmation,
    );
    fixture.detectChanges();

    expect(password.value).toBe("");
    expect(confirmation.value).toBe("");
    expect(registerWithPassword).toHaveBeenCalledWith(
      "person@example.com",
      "test-password",
      expect.any(AbortSignal),
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(root.textContent).toContain("Verifica tu correo");
    expect(
      root.querySelector('[data-testid="firebase-password-form"]'),
    ).toBeNull();
    await fixture.componentInstance.resendVerification();
    expect(resendVerification).toHaveBeenCalledOnce();
    await fixture.componentInstance.checkVerification();
    expect(checkEmailVerification).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/asistente");
  });

  it("rejects mismatched registration passwords without calling Firebase or retaining the inputs", async () => {
    const { fixture, registerWithPassword } = setup("firebase");
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.componentInstance.setPasswordMode("register");
    const root = fixture.nativeElement as HTMLElement;
    const email = root.querySelector("#firebase-email") as HTMLInputElement;
    const password = root.querySelector(
      "#firebase-password",
    ) as HTMLInputElement;
    const confirmation = root.querySelector(
      "#firebase-confirmation",
    ) as HTMLInputElement;
    password.value = "test-password";
    confirmation.value = "different-password";
    await fixture.componentInstance.submitPassword(
      new Event("submit"),
      email,
      password,
      confirmation,
    );
    fixture.detectChanges();
    expect(password.value).toBe("");
    expect(confirmation.value).toBe("");
    expect(registerWithPassword).not.toHaveBeenCalled();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      "no coinciden",
    );
  });

  it("uses a generic password-reset notice without disclosing registered methods", async () => {
    const { fixture, resetPassword } = setup("firebase");
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const email = root.querySelector("#firebase-email") as HTMLInputElement;
    email.value = "person@example.com";
    await fixture.componentInstance.sendPasswordReset(email);
    fixture.detectChanges();
    expect(resetPassword).toHaveBeenCalledExactlyOnceWith(
      "person@example.com",
      expect.any(AbortSignal),
    );
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      "Si la cuenta admite contraseña",
    );
  });

  it("does not repeat sign-in while an operation is pending and aborts its owner on destruction", async () => {
    const { fixture, loginWithGoogle, navigate } = setup("firebase");
    await fixture.whenStable();
    const pending = deferred<typeof principal>();
    loginWithGoogle.mockReturnValueOnce(pending.promise);
    const command = fixture.componentInstance.loginWithGoogle();
    await fixture.componentInstance.loginWithGoogle();
    expect(loginWithGoogle).toHaveBeenCalledOnce();
    const signal = loginWithGoogle.mock.calls[0]?.[0];
    fixture.destroy();
    expect(signal?.aborted).toBe(true);
    pending.resolve(principal);
    await command;
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows safe collision guidance rather than Firebase exception details", async () => {
    const { fixture, loginWithGoogle } = setup("firebase");
    await fixture.whenStable();
    loginWithGoogle.mockRejectedValueOnce(
      new FirebaseError(
        "auth/account-exists-with-different-credential",
        "secret OAuth token",
      ),
    );
    await fixture.componentInstance.loginWithGoogle();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      "Acceso y seguridad",
    );
    expect(root.textContent).not.toContain("secret OAuth token");
  });
});
