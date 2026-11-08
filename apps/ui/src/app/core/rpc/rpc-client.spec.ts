import { createEnvironmentInjector, EnvironmentInjector } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { TRPCClientError } from "@trpc/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "../../../environments/environment";
import { deferred } from "../../../testing/deferred";
import {
  account,
  principal,
  type RpcOutput,
  rpcFailure,
  rpcResponse,
  setupRpc,
} from "../../../testing/rpc";
import { API_URL } from "../../tokens/api-url";
import { AuthApi } from "../auth/auth-api";
import { AuthCredentials } from "../auth/auth-credentials";
import { RPC_FETCH, RpcClient } from "./rpc-client";
import { isCancelled } from "./rpc-error";

describe("scoped native tRPC transport", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("calls the environment API origin directly, appending only the RPC path", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      rpcResponse({ provider: "mock" }),
    );
    TestBed.configureTestingModule({
      providers: [{ provide: RPC_FETCH, useValue: fetch }],
    });
    await TestBed.inject(AuthApi).config();
    expect(TestBed.inject(API_URL)).toBe(environment.apiUrl);
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.origin).toBe(new URL(environment.apiUrl).origin);
    expect(url.pathname).toBe("/trpc/auth.config");
    expect(fetch.mock.calls[0][1]?.cache).toBe("no-store");
  });

  it("keeps public calls anonymous and candidate verification separate from the accepted session", async () => {
    const { callsTo, credentials } = setupRpc();
    const auth = TestBed.inject(AuthApi);
    await auth.config();
    await auth.loginMock("demo@lazyfinance.cl", "password");
    await auth.verifyPrincipal("candidate");
    expect(callsTo("auth.config")[0].authorization).toBeNull();
    expect(callsTo("auth.loginMock")[0]).toMatchObject({
      authorization: null,
      input: { email: "demo@lazyfinance.cl", password: "password" },
    });
    expect(callsTo("auth.loginMock")[0].options?.method).toBe("POST");
    expect(callsTo("auth.principal")[0].authorization).toBe("Bearer candidate");
    expect(credentials.current()?.token).toBe("alice");
  });

  it("reuses one client per verified snapshot and uses the configured URL and no-store", async () => {
    const { rpc, credentials, fetch } = setupRpc();
    const scope = rpc.requireScope();
    expect(rpc.requireScope()).toBe(scope);
    await scope.client.accounts.list.query();
    expect(String(fetch.mock.calls[0][0])).toBe(
      "http://api.test/trpc/accounts.list",
    );
    expect(fetch.mock.calls[0][1]?.cache).toBe("no-store");
    credentials.accept(principal, "refreshed");
    expect(rpc.requireScope()).not.toBe(scope);
    expect(scope.signal.aborted).toBe(true);
  });

  it("cancels old-user work even when a fetch implementation ignores abort", async () => {
    const old = deferred<RpcOutput<"accounts.list">>();
    const { rpc, credentials, callsTo } = setupRpc({
      "accounts.list": (_input, call) =>
        call.authorization === "Bearer alice"
          ? old.promise
          : [account("bob-only")],
    });
    const pending = rpc.requireScope().client.accounts.list.query();
    const rejected = expect(pending).rejects.toSatisfy(isCancelled);
    await vi.waitFor(() => expect(callsTo("accounts.list")).toHaveLength(1));
    credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    await rejected;
    expect(callsTo("accounts.list")[0].options?.signal?.aborted).toBe(true);
    old.resolve([account("alice-secret")]);
    expect(await rpc.requireScope().client.accounts.list.query()).toEqual([
      account("bob-only"),
    ]);
  });

  it("honors per-query cancellation without expiring the session", async () => {
    const { rpc, credentials } = setupRpc({
      "accounts.list": () => new Promise(() => {}),
    });
    const controller = new AbortController();
    const request = rpc
      .requireScope()
      .client.accounts.list.query(undefined, { signal: controller.signal });
    const rejected = expect(request).rejects.toSatisfy(isCancelled);
    controller.abort();
    await rejected;
    expect(credentials.current()?.token).toBe("alice");
  });

  it("preserves tRPC error codes and only expires the current accepted scope", async () => {
    const { rpc, credentials, navigate } = setupRpc({
      "accounts.list": () => rpcFailure(),
    });
    await expect(
      rpc.requireScope().client.accounts.list.query(),
    ).rejects.toMatchObject({
      data: { code: "SERVICE_UNAVAILABLE" },
    });
    expect(credentials.current()?.token).toBe("alice");
    await expect(
      rpc.requireScope().client.accounts.list.query(),
    ).rejects.toBeInstanceOf(TRPCClientError);
    const accepted = credentials.current()!;
    credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    credentials.expire(accepted);
    expect(credentials.current()?.token).toBe("bob");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("handles current-session 401 centrally but does not expire a session on candidate verification failure", async () => {
    const { rpc, credentials, navigate } = setupRpc({
      "auth.principal": () => rpcFailure("UNAUTHORIZED", 401),
      "accounts.list": () => rpcFailure("UNAUTHORIZED", 401),
    });
    await expect(
      TestBed.inject(AuthApi).verifyPrincipal("bad-candidate"),
    ).rejects.toMatchObject({
      data: { code: "UNAUTHORIZED" },
    });
    expect(credentials.current()?.token).toBe("alice");
    await expect(
      rpc.requireScope().client.accounts.list.query(),
    ).rejects.toMatchObject({
      data: { code: "UNAUTHORIZED" },
    });
    TestBed.tick();
    expect(credentials.current()).toBeUndefined();
    // Transport expires credentials; the workspace boundary owns guest navigation.
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not let a late 401 from an obsolete request log out a newer identity", async () => {
    const old = deferred<Response>();
    const { rpc, credentials, callsTo, navigate } = setupRpc({
      "accounts.list": () => old.promise,
    });
    const pending = rpc
      .requireScope()
      .client.accounts.list.query()
      .catch((error) => error);
    await vi.waitFor(() => expect(callsTo("accounts.list")).toHaveLength(1));
    credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    old.resolve(rpcFailure("UNAUTHORIZED", 401));
    await pending;
    TestBed.tick();
    expect(credentials.current()?.token).toBe("bob");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("isolates concurrent render injectors and disposes their transport lifetimes", async () => {
    const { fetch } = setupRpc();
    fetch.mockImplementation(async (_url, options) =>
      rpcResponse([{ id: new Headers(options?.headers).get("authorization") }]),
    );
    const parent = TestBed.inject(EnvironmentInjector);
    const a = createEnvironmentInjector([RpcClient, AuthCredentials], parent);
    const b = createEnvironmentInjector([RpcClient, AuthCredentials], parent);

    try {
      a.get(AuthCredentials).accept(principal, "alice");
      b.get(AuthCredentials).accept({ ...principal, userId: "owner-b" }, "bob");
      const [alice, bob] = await Promise.all([
        a.get(RpcClient).requireScope().client.accounts.list.query(),
        b.get(RpcClient).requireScope().client.accounts.list.query(),
      ]);
      expect(alice).toEqual([{ id: "Bearer alice" }]);
      expect(bob).toEqual([{ id: "Bearer bob" }]);
      fetch.mockImplementation(() => new Promise(() => {}));
      const pending = a
        .get(RpcClient)
        .requireScope()
        .client.accounts.list.query();
      const rejected = expect(pending).rejects.toSatisfy(isCancelled);
      a.destroy();
      await rejected;
    } finally {
      if (!a.destroyed) a.destroy();

      b.destroy();
    }
  });
});
