import { TRPCClientError } from "@trpc/client";
import { FirebaseError } from "firebase/app";
import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth-error";

describe("authentication display policy", () => {
  it.each([
    "auth/invalid-credential",
    "auth/wrong-password",
    "auth/user-not-found",
    "auth/user-disabled",
  ])("does not disclose credential/account details for %s", (code) => {
    expect(
      authErrorMessage(
        new FirebaseError(code, "secret SDK details", {
          email: "private@example.com",
        }),
        "signin",
      ),
    ).toBe(
      "No pudimos iniciar sesión. Revisa tus credenciales e inténtalo de nuevo.",
    );
  });

  it.each([
    "auth/account-exists-with-different-credential",
    "auth/email-already-in-use",
  ])("directs conflicts to explicit linking without enumerating methods: %s", (code) => {
    const message = authErrorMessage(
      new FirebaseError(code, "secret token", {
        credential: "pending OAuth credential",
      }),
      "signin",
    );
    expect(message).toContain("Acceso y seguridad");
    expect(message).not.toContain("secret");
    expect(message).not.toContain("OAuth credential");
  });

  it("does not offer to merge financial data when a credential belongs to another Firebase user", () => {
    expect(
      authErrorMessage(
        new FirebaseError("auth/credential-already-in-use", "secret"),
        "link",
      ),
    ).toContain("No combinamos cuentas ni sus datos automáticamente");
  });

  it("sanitizes API identity conflicts", () => {
    const error = TRPCClientError.from({
      error: {
        code: -32009,
        message: "private database detail",
        data: { code: "CONFLICT" },
      },
    });
    const message = authErrorMessage(error, "signin");
    expect(message).toContain("no combinamos cuentas por correo");
    expect(message).not.toContain("database");
  });

  it("handles wrapped cancellation and unknown errors without displaying raw messages", () => {
    expect(
      authErrorMessage(
        { cause: new DOMException("private request", "AbortError") },
        "link",
      ),
    ).toContain("La sesión cambió");
    expect(
      authErrorMessage(new Error("secret token and email"), "link"),
    ).toContain("Revisa tus métodos");
    expect(
      authErrorMessage(new Error("secret token and email"), "link"),
    ).not.toContain("secret");
  });
});
