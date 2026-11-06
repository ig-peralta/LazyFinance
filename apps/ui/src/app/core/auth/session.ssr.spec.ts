import "@angular/compiler";
import {
  Component,
  inject,
  provideAppInitializer,
  provideZonelessChangeDetection,
  REQUEST,
  RESPONSE_INIT,
} from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import {
  provideServerRendering,
  renderApplication,
} from "@angular/platform-server";
import { provideRouter, RouterOutlet } from "@angular/router";
import type {
  AuthConfig,
  AuthPrincipal,
  AuthProvider,
} from "@lazyfinance/contracts";
import { describe, expect, it, vi } from "vitest";
import { createRpcFetch } from "../../../testing/rpc";
import { AccountsData } from "../../features/accounts/accounts.data";
import { authGuard } from "../../guards/auth.guard";
import { Account } from "../../pages/dashboard/account/account";
import { initializeServices } from "../../services/initializer";
import { API_URL } from "../../tokens/api-url";
import { RPC_FETCH } from "../rpc/rpc-client";
import { AuthApi } from "./auth-api";
import { SessionService } from "./session.service";

@Component({
  selector: "session-ssr-root",
  imports: [RouterOutlet],
  template: "<router-outlet />",
})
class SsrRoot {}

@Component({
  imports: [Account],
  providers: [AccountsData],
  template:
    "<p>PRIVATE_FINANCIAL_DATA {{ session.user()?.email }}</p><dashboard-account />",
})
class PrivatePage {
  readonly session = inject(SessionService);
}

@Component({ template: "<p>LOGIN_REQUIRED</p>" })
class LoginPage {}

describe("Firebase protected SSR", () => {
  async function render(
    cookie: string,
    getPrincipal: (token: string) => Promise<AuthPrincipal>,
    provider: AuthProvider = "firebase",
  ) {
    const request = new Request("http://localhost/dashboard", {
      headers: { cookie: `lazyfinance-session=${encodeURIComponent(cookie)}` },
    });
    const mock = createRpcFetch({
      "accounts.list": (_input, call) => [
        {
          id: "account",
          alias:
            call.authorization === "Bearer second-token"
              ? "BOB_PRIVATE_ACCOUNT"
              : "ALICE_PRIVATE_ACCOUNT",
          type: "checking",
          currency: "CLP",
          balance: "12345.00",
          lastSyncedAt: null,
        },
      ],
    });

    return renderApplication(
      (context) =>
        bootstrapApplication(
          SsrRoot,
          {
            providers: [
              provideZonelessChangeDetection(),
              provideServerRendering(),
              provideRouter([
                {
                  path: "dashboard",
                  component: PrivatePage,
                  canActivate: [authGuard],
                },
                { path: "login", component: LoginPage },
              ]),
              provideAppInitializer(initializeServices),
              { provide: REQUEST, useValue: request },
              { provide: RESPONSE_INIT, useValue: { headers: new Headers() } },
              { provide: API_URL, useValue: "http://ssr-api.internal" },
              { provide: RPC_FETCH, useValue: mock.fetch },
              {
                provide: AuthApi,
                useValue: {
                  config: async (): Promise<AuthConfig> => ({ provider }),
                  verifyPrincipal: getPrincipal,
                },
              },
            ],
          },
          context,
        ),
      {
        document:
          "<!doctype html><html><body><session-ssr-root></session-ssr-root></body></html>",
        url: "http://localhost/dashboard",
        allowedHosts: ["localhost"],
      },
    );
  }

  it("renders financial content only after API validation of the cookie token", async () => {
    const getPrincipal = vi.fn(async () => ({
      userId: "owner",
      email: "owner@example.com",
      name: "Owner",
    }));
    const html = await render(
      JSON.stringify({ token: "signed-token" }),
      getPrincipal,
    );
    expect(getPrincipal).toHaveBeenCalledExactlyOnceWith("signed-token");
    expect(html).toContain("PRIVATE_FINANCIAL_DATA");
    expect(html).not.toContain("signed-token");
    expect(html).toContain("ALICE_PRIVATE_ACCOUNT");
    // The rendered HTML is private; its hydration payload must not export RPC data.
    const transfer =
      /<script[^>]*id="ng-state"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1] ??
      "{}";
    expect(transfer).not.toContain("ALICE_PRIVATE_ACCOUNT");
    expect(transfer).not.toContain("12345.00");
  });

  it("does not render financial content from an expired token or client-supplied user", async () => {
    const getPrincipal = vi.fn(async () => {
      throw new Error("Expired token");
    });
    const expired = await render(
      JSON.stringify({ token: "expired-token" }),
      getPrincipal,
    );
    expect(expired).not.toContain("PRIVATE_FINANCIAL_DATA");
    expect(getPrincipal).toHaveBeenCalledExactlyOnceWith("expired-token");

    const forged = await render(
      JSON.stringify({ token: "signed-token", user: { userId: "other" } }),
      getPrincipal,
    );
    expect(forged).not.toContain("PRIVATE_FINANCIAL_DATA");
    expect(getPrincipal).toHaveBeenCalledTimes(1);
  });

  it("revalidates each SSR request when the browser switches between two identities", async () => {
    const getPrincipal = vi.fn(async (token: string) => {
      if (token === "first-token")
        return { userId: "first", email: "first@example.com", name: "First" };
      if (token === "second-token")
        return {
          userId: "second",
          email: "second@example.com",
          name: "Second",
        };

      throw new Error("Invalid token");
    });
    const [first, second] = await Promise.all([
      render(JSON.stringify({ token: "first-token" }), getPrincipal),
      render(JSON.stringify({ token: "second-token" }), getPrincipal),
    ]);
    const rejected = await render(
      JSON.stringify({ token: "first-token-expired" }),
      getPrincipal,
    );

    expect(first).toContain("first@example.com");
    expect(first).not.toContain("second@example.com");
    expect(second).toContain("second@example.com");
    expect(second).not.toContain("first@example.com");
    expect(first).toContain("ALICE_PRIVATE_ACCOUNT");
    expect(first).not.toContain("BOB_PRIVATE_ACCOUNT");
    expect(second).toContain("BOB_PRIVATE_ACCOUNT");
    expect(second).not.toContain("ALICE_PRIVATE_ACCOUNT");
    expect(rejected).not.toContain("PRIVATE_FINANCIAL_DATA");
    expect(getPrincipal.mock.calls.map(([token]) => token)).toEqual([
      "first-token",
      "second-token",
      "first-token-expired",
    ]);
  });

  it("requires API verification for the local mock provider too", async () => {
    const getPrincipal = vi.fn(async () => {
      throw new Error("Unknown mock identity");
    });
    const html = await render(
      JSON.stringify({ token: "forged-mock-token" }),
      getPrincipal,
      "mock",
    );
    expect(getPrincipal).toHaveBeenCalledExactlyOnceWith("forged-mock-token");
    expect(html).not.toContain("PRIVATE_FINANCIAL_DATA");
  });
});
