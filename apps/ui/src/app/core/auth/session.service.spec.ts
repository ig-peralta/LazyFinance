import "@angular/compiler";
import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { AuthConfig } from "@lazyfinance/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import { rpcFailure } from "../../../testing/rpc";
import { FirebaseService } from "../../services/firebase/firebase.service";
import { RPC_FETCH } from "../rpc/rpc-client";
import { AuthApi } from "./auth-api";
import { SessionService } from "./session.service";

const principal = {
  userId: "demo-user",
  email: "demo@lazyfinance.cl",
  name: "Camila Rojas",
};
const tokenKey = "lazyfinance-mock-token";

function setup() {
  const config = vi.fn<() => Promise<AuthConfig>>(async () => ({
    provider: "mock",
  }));
  const verify = vi.fn<
    (
      ...args: Parameters<AuthApi["verifyPrincipal"]>
    ) => Promise<Awaited<ReturnType<AuthApi["verifyPrincipal"]>>>
  >(async () => principal);
  const firebase = { init: vi.fn(), auth: () => null };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthApi, useValue: { config, verifyPrincipal: verify } },
      { provide: FirebaseService, useValue: firebase },
    ],
  });
  return { session: TestBed.inject(SessionService), config, verify, firebase };
}

describe("browser-owned session startup", () => {
  afterEach(() => {
    sessionStorage.clear();
    document.cookie = "lazyfinance-session=; Max-Age=0; Path=/";
    TestBed.resetTestingModule();
  });

  it("does no authentication work until a browser entry explicitly starts it", () => {
    const f = setup();
    expect(f.session.status()).toBe("idle");
    expect(f.config).not.toHaveBeenCalled();
    expect(f.firebase.init).not.toHaveBeenCalled();
  });

  it("shares pending startup and does not bootstrap again across navigation", async () => {
    const f = setup();
    const pending = deferred<AuthConfig>();
    f.config.mockReturnValueOnce(pending.promise);
    const first = f.session.start();
    expect(f.session.start()).toBe(first);
    expect(f.session.status()).toBe("loading");
    pending.resolve({ provider: "mock" });
    await first;
    await f.session.start();
    expect(f.config).toHaveBeenCalledOnce();
    expect(f.session.status()).toBe("anonymous");
    expect(f.firebase.init).not.toHaveBeenCalled();
  });

  it("exposes provider discovery failures as retryable errors, not a selected mock provider", async () => {
    const f = setup();
    f.config.mockRejectedValueOnce(new TypeError("offline"));
    await f.session.start();
    expect(f.session.status()).toBe("error");
    expect(f.session.provider()).toBeNull();
    await f.session.retry();
    expect(f.session.provider()).toBe("mock");
    expect(f.session.error()).toBeNull();
  });

  it("expires the old SSR cookie without verifying or adopting its token/principal", async () => {
    document.cookie = `lazyfinance-session=${encodeURIComponent(JSON.stringify({ token: "old-token", user: principal }))}; Path=/`;
    const f = setup();
    await f.session.start();
    expect(f.verify).not.toHaveBeenCalled();
    expect(f.session.active()).toBe(false);
    expect(document.cookie).not.toContain("lazyfinance-session");
  });

  it("verifies a session-only demo token on reload and clears it on logout", async () => {
    sessionStorage.setItem(tokenKey, "saved-token");
    const f = setup();
    await f.session.start();
    expect(f.verify).toHaveBeenCalledExactlyOnceWith(
      "saved-token",
      expect.any(AbortSignal),
    );
    expect(f.session.user()).toEqual(principal);
    expect(f.session.status()).toBe("ready");
    await f.session.logout();
    expect(f.session.active()).toBe(false);
    expect(sessionStorage.getItem(tokenKey)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("never stores a principal and accepts demo login only after verification", async () => {
    const f = setup();
    await f.session.start();
    const pending = deferred<typeof principal>();
    f.verify.mockReturnValueOnce(pending.promise);
    const login = f.session.loginWithToken(" demo-token ");
    expect(f.session.active()).toBe(false);
    expect(sessionStorage.getItem(tokenKey)).toBeNull();
    pending.resolve(principal);
    await login;
    expect(sessionStorage.getItem(tokenKey)).toBe("demo-token");
    expect(document.cookie).not.toContain("lazyfinance-session");
  });

  it("does not let an old restoration failure clear a newer login", async () => {
    sessionStorage.setItem(tokenKey, "old-token");
    const f = setup();
    const pending = deferred<typeof principal>();
    f.verify.mockReturnValueOnce(pending.promise);
    const startup = f.session.start();
    await vi.waitFor(() => expect(f.verify).toHaveBeenCalledOnce());
    await f.session.loginWithToken("new-token");
    pending.reject(new Error("old failure"));
    await startup;
    expect(f.session.token()).toBe("new-token");
    expect(f.session.error()).toBeNull();
  });

  it("cancels a demo candidate when its login component is destroyed", async () => {
    const f = setup();
    await f.session.start();
    const pending = deferred<typeof principal>();
    f.verify.mockReturnValueOnce(pending.promise);
    const owner = new AbortController();
    const login = f.session.loginWithToken("candidate-token", owner.signal);
    const rejected = expect(login).rejects.toMatchObject({
      name: "AbortError",
    });
    owner.abort();
    expect(f.verify.mock.calls[0][1]?.aborted).toBe(true);
    pending.resolve(principal);
    await rejected;
    expect(f.session.active()).toBe(false);
    expect(sessionStorage.getItem(tokenKey)).toBeNull();
  });

  it("aborts restoration and ignores late responses after logout", async () => {
    sessionStorage.setItem(tokenKey, "saved-token");
    const f = setup();
    const pending = deferred<typeof principal>();
    f.verify.mockReturnValueOnce(pending.promise);
    const startup = f.session.start();
    await vi.waitFor(() => expect(f.verify).toHaveBeenCalledOnce());
    const signal = f.verify.mock.calls[0][1];
    await f.session.logout();
    expect(signal?.aborted).toBe(true);
    pending.resolve(principal);
    await startup;
    expect(f.session.active()).toBe(false);
    expect(sessionStorage.getItem(tokenKey)).toBeNull();
  });

  it("does not install provider discovery after logout has invalidated startup", async () => {
    const f = setup();
    const pending = deferred<AuthConfig>();
    f.config.mockReturnValueOnce(pending.promise);
    const startup = f.session.start();
    await f.session.logout();
    pending.resolve({ provider: "firebase" });
    await startup;
    expect(f.firebase.init).not.toHaveBeenCalled();
    expect(f.session.active()).toBe(false);
  });

  it("retains established access during a transient revalidation failure", async () => {
    const f = setup();
    await f.session.start();
    await f.session.loginWithToken("saved-token");
    f.verify.mockRejectedValueOnce(new TypeError("offline"));
    await f.session.retry();
    expect(f.session.status()).toBe("ready");
    expect(f.session.error()).not.toBeNull();
    expect(f.session.token()).toBe("saved-token");
  });

  it("clears a definitively rejected restored token using real RPC error policy", async () => {
    sessionStorage.setItem(tokenKey, "expired-token");
    TestBed.configureTestingModule({
      providers: [
        {
          provide: RPC_FETCH,
          useValue: async (url: string | URL | Request) =>
            String(url).includes("auth.config")
              ? new Response(
                  JSON.stringify({ result: { data: { provider: "mock" } } }),
                  { headers: { "Content-Type": "application/json" } },
                )
              : rpcFailure("UNAUTHORIZED", 401),
        },
      ],
    });
    const session = TestBed.inject(SessionService);
    await session.start();
    expect(session.status()).toBe("anonymous");
    expect(sessionStorage.getItem(tokenKey)).toBeNull();
  });

  it("never initializes identity or contacts the API during server prerendering", async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: "server" }],
    });
    const f = setup();
    await f.session.start();
    await f.session.retry();
    expect(f.config).not.toHaveBeenCalled();
    expect(f.verify).not.toHaveBeenCalled();
    expect(f.firebase.init).not.toHaveBeenCalled();
  });
});
