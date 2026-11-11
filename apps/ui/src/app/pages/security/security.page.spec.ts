import "@angular/compiler";
import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { AuthPrincipal, AuthProvider } from "@lazyfinance/contracts";
import { FirebaseError } from "firebase/app";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import {
  type FirebaseAccount,
  SessionService,
} from "../../core/auth/session.service";
import { SecurityPage } from "./security.page";

function setup(
  method: "google" | "password" | "both" = "google",
  mode: AuthProvider = "firebase",
) {
  const user = signal<AuthPrincipal | null>({
    userId: "owner-a",
    email: "person@example.com",
    name: "Person",
  });
  const account = signal<FirebaseAccount | null>({
    uid: "firebase-a",
    email: "person@example.com",
    emailVerified: true,
    google: method !== "password",
    password: method !== "google",
  });
  const ready = signal(false);
  const session = {
    user,
    active: signal(true),
    provider: signal(mode),
    firebaseAccount: account,
    googleLinkReady: ready,
    isResolving: signal(false),
    prepareGoogleLink: vi.fn<SessionService["prepareGoogleLink"]>(async () => {
      ready.set(true);
    }),
    linkGoogle: vi.fn<SessionService["linkGoogle"]>(async () => {
      ready.set(false);
      account.update((current) => current && { ...current, google: true });
    }),
    linkPassword: vi.fn<SessionService["linkPassword"]>(async () => {
      account.update((current) => current && { ...current, password: true });
    }),
    resendVerification: vi.fn<SessionService["resendVerification"]>(
      async () => {},
    ),
    checkEmailVerification: vi.fn<SessionService["checkEmailVerification"]>(
      async () => true,
    ),
  } satisfies Pick<
    SessionService,
    | "user"
    | "active"
    | "provider"
    | "firebaseAccount"
    | "googleLinkReady"
    | "isResolving"
    | "prepareGoogleLink"
    | "linkGoogle"
    | "linkPassword"
    | "resendVerification"
    | "checkEmailVerification"
  >;
  TestBed.configureTestingModule({
    providers: [{ provide: SessionService, useValue: session }],
  });
  const fixture = TestBed.createComponent(SecurityPage);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, session, user, account, ready };
}

describe("SecurityPage", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("does not offer credential changes in mock mode", () => {
    const { root } = setup("google", "mock");
    expect(root.textContent).toContain("demostración");
    expect(root.querySelector("form")).toBeNull();
  });

  it("shows both connected methods without offering unlink or account merging", () => {
    const { root } = setup("both");
    expect(root.querySelector(".page-header h1")?.textContent).toBe(
      "Acceso y seguridad",
    );
    expect(root.textContent).toContain(
      "Correo de la cuenta: person@example.com",
    );
    expect(root.textContent).not.toContain("Cuenta de Firebase");
    expect(
      root.querySelector('[data-testid="google-connected"]'),
    ).not.toBeNull();
    expect(
      root.querySelector('[data-testid="password-connected"]'),
    ).not.toBeNull();
    expect(root.querySelector("form")).toBeNull();
    expect(root.textContent).toContain(
      "no fusionamos identidades ni datos financieros",
    );
  });

  it("clears new passwords before submitting the same-account linking command", async () => {
    const { fixture, root, session } = setup();
    expect(root.querySelectorAll("form")).toHaveLength(1);
    expect(root.querySelector("form .form-grid .field input")).not.toBeNull();
    const password = root.querySelector("#new-password") as HTMLInputElement;
    const confirmation = root.querySelector(
      "#confirm-password",
    ) as HTMLInputElement;
    password.value = confirmation.value = "new-password";
    const command = fixture.componentInstance.addPassword(
      new Event("submit"),
      password,
      confirmation,
    );
    expect(password.value).toBe("");
    expect(confirmation.value).toBe("");
    await command;
    fixture.detectChanges();

    expect(session.linkPassword).toHaveBeenCalledWith(
      "new-password",
      expect.any(AbortSignal),
    );
    expect(
      root.querySelector('[data-testid="password-connected"]'),
    ).not.toBeNull();
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      "misma cuenta",
    );
  });

  it("rejects mismatching passwords without retaining either input", async () => {
    const { fixture, root, session } = setup();
    const password = root.querySelector("#new-password") as HTMLInputElement;
    const confirmation = root.querySelector(
      "#confirm-password",
    ) as HTMLInputElement;
    password.value = "new-password";
    confirmation.value = "different-password";
    await fixture.componentInstance.addPassword(
      new Event("submit"),
      password,
      confirmation,
    );
    fixture.detectChanges();

    expect(password.value).toBe("");
    expect(confirmation.value).toBe("");
    expect(session.linkPassword).not.toHaveBeenCalled();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      "no coinciden",
    );
  });

  it("requires a separate user action to open Google after confirming the current password", async () => {
    const { fixture, root, session } = setup("password");
    const password = root.querySelector(
      "#current-password",
    ) as HTMLInputElement;
    password.value = "current-password";
    await fixture.componentInstance.prepareGoogle(
      new Event("submit"),
      password,
    );
    fixture.detectChanges();

    expect(password.value).toBe("");
    expect(session.prepareGoogleLink).toHaveBeenCalledWith(
      "current-password",
      expect.any(AbortSignal),
    );
    expect(session.linkGoogle).not.toHaveBeenCalled();
    const button = root.querySelector(
      '[data-testid="link-google"]',
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(session.linkGoogle).toHaveBeenCalledOnce();
    expect(
      root.querySelector('[data-testid="google-connected"]'),
    ).not.toBeNull();
  });

  it("prevents duplicate linking and cancels command acceptance on destruction", async () => {
    const { fixture, session, ready } = setup("password");
    ready.set(true);
    const pending = deferred<void>();
    session.linkGoogle.mockReturnValueOnce(pending.promise);
    const command = fixture.componentInstance.linkGoogle();
    await fixture.componentInstance.linkGoogle();
    expect(session.linkGoogle).toHaveBeenCalledOnce();
    const signal = session.linkGoogle.mock.calls[0]?.[0];
    fixture.destroy();
    expect(signal?.aborted).toBe(true);
    pending.resolve();
    await command;
    expect(fixture.componentInstance.notice()).toBeNull();
  });

  it("does not display an old account's pending result on another owner", async () => {
    const { fixture, session, user, account } = setup("password");
    const pending = deferred<void>();
    session.linkGoogle.mockReturnValueOnce(pending.promise);
    const command = fixture.componentInstance.linkGoogle();
    user.set({
      userId: "owner-b",
      email: "second@example.com",
      name: "Second",
    });
    account.update(
      (current) =>
        current && {
          ...current,
          uid: "firebase-b",
          email: "second@example.com",
        },
    );
    pending.resolve();
    await command;
    fixture.detectChanges();
    expect(fixture.componentInstance.notice()).toBeNull();
    expect(fixture.componentInstance.error()).toBeNull();
  });

  it("sanitizes provider errors rather than exposing SDK details or pending credentials", async () => {
    const { fixture, root, session } = setup("password");
    session.linkGoogle.mockRejectedValueOnce(
      new FirebaseError(
        "auth/credential-already-in-use",
        "secret OAuth credential",
      ),
    );
    await fixture.componentInstance.linkGoogle();
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      "No combinamos cuentas",
    );
    expect(root.textContent).not.toContain("secret OAuth");
  });
});
