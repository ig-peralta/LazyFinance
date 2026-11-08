import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { FintocLink } from "../../../src/banking/fintoc/client/fintoc-client";
import { FintocCredentials } from "../../../src/banking/fintoc/credentials/fintoc-credentials";
import {
  fintocEnvironment,
  fintocIntent,
  fintocLink,
} from "../../fixtures/banking/fintoc";
import { testEnvironment } from "../../fixtures/environment";
import { fixture, integration, startApi } from "../../fixtures/persistence";

function signal() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function setup() {
  const f = await fixture();
  f.environment = fintocEnvironment();
  const externalId = `link_${randomUUID().replaceAll("-", "")}`;
  const link: FintocLink = {
    ...fintocLink,
    id: externalId,
    link_token: `${externalId}_token_private`,
  };
  const intents = new Set<string>();
  const state = {
    link,
    failDelete: false,
    failExchange: false,
    exchanges: 0,
    deletes: 0,
    exists: true,
  };
  const onExchange = vi.fn<() => Promise<void>>(async () => {});
  const onCheck = vi.fn<() => Promise<void>>(async () => {});
  const fetch = vi.fn<typeof globalThis.fetch>(async (address, options) => {
    expect(new Headers(options?.headers).get("Authorization")).toBe(
      "sk_test_fixture",
    );
    const url = new URL(String(address));
    if (url.pathname === "/v1/link_intents") {
      const id = `li_${randomUUID().replaceAll("-", "")}`;
      intents.add(id);
      return Response.json(
        { ...fintocIntent, id, widget_token: `${id}_sec_public` },
        { status: 201 },
      );
    }
    if (url.pathname === "/v1/links/exchange") {
      state.exchanges++;
      const id =
        url.searchParams.get("exchange_token")?.split("_exc_")[0] ?? "";
      if (state.failExchange) throw new Error("Uncertain provider response");
      if (!intents.delete(id)) return new Response(null, { status: 403 });
      await onExchange();
      return Response.json(state.link);
    }
    if (options?.method === "DELETE") {
      state.deletes++;
      if (state.failDelete)
        return Response.json(
          { error: { message: "private-provider-secret" } },
          { status: 503 },
        );
      const status = state.exists ? 204 : 404;
      state.exists = false;
      return new Response(null, { status });
    }
    const response = state.exists
      ? Response.json({ ...state.link, link_token: null })
      : new Response(null, { status: 404 });
    await onCheck();
    return response;
  });
  const api = await startApi(f, false, fetch);
  const first = api.client(),
    other = api.client(f.otherToken);
  const complete = (
    intent: { id: string; widgetToken: string },
    client = first,
  ) =>
    client.banking.completeLink.mutate({
      id: intent.id,
      exchangeToken: `${intent.widgetToken.split("_sec_")[0]}_exc_authorization`,
    });
  return {
    ...f,
    ...api,
    first,
    other,
    fetch,
    state,
    onExchange,
    onCheck,
    complete,
    async close() {
      await api.app.close();
      await f.db.close();
    },
  };
}

describe.skipIf(!integration)(
  "Fintoc lifecycle through public auth, signed persistence and real RLS",
  () => {
    it("requires an authenticated application user for every lifecycle procedure", async () => {
      const f = await setup();
      try {
        const anonymous = f.client("");
        for (const result of await Promise.allSettled([
          anonymous.banking.configuration.query(),
          anonymous.banking.connections.query(),
          anonymous.banking.createLinkIntent.mutate({
            holderType: "individual",
          }),
          anonymous.banking.completeLink.mutate({
            id: randomUUID(),
            exchangeToken: "li_fixture_exc_authorization",
          }),
          anonymous.banking.checkConnection.mutate({ id: randomUUID() }),
          anonymous.banking.disconnect.mutate({ id: randomUUID() }),
        ])) {
          expect(result.status).toBe("rejected");
          if (result.status === "rejected")
            expect(result.reason).toMatchObject({
              data: { code: "UNAUTHORIZED" },
            });
        }
        expect(f.fetch).not.toHaveBeenCalled();
      } finally {
        await f.close();
      }
    });

    it("binds callbacks to the owned intent and returns replayed results without a second provider exchange", async () => {
      const f = await setup();
      try {
        const intent = await f.first.banking.createLinkIntent.mutate({
          holderType: "individual",
        });
        await expect(f.complete(intent, f.other)).rejects.toMatchObject({
          data: { code: "NOT_FOUND" },
        });
        expect(f.state.exchanges).toBe(0);
        const connected = await f.complete(intent);
        expect(await f.complete(intent)).toEqual(connected);
        expect(f.state.exchanges).toBe(1);
        expect(await f.first.banking.connections.query()).toEqual([connected]);
        expect(await f.other.banking.connections.query()).toEqual([]);
        expect(JSON.stringify(connected)).not.toMatch(
          /credential|link_token|externalId|token_private|sk_test/,
        );
        const [row] = await f.db.rows("provider_connection", {
          id: connected.id,
        });
        expect(row.user_id).toBe(f.userId);
        expect(row.encrypted_credential).not.toContain("token_private");
        expect(
          new FintocCredentials(f.environment).open(
            row.encrypted_credential ?? "",
            f.userId,
            "test",
            row.external_id ?? "",
          ),
        ).toBe(f.state.link.link_token);
        await expect(
          f.other.banking.checkConnection.mutate({ id: connected.id }),
        ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
        await expect(
          f.other.banking.disconnect.mutate({ id: connected.id }),
        ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
        await expect(
          f.other.banking.createLinkIntent.mutate({
            holderType: "individual",
            connectionId: connected.id,
          }),
        ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      } finally {
        await f.close();
      }
    });

    it("rejects mismatched and concurrent callbacks before another exchange", async () => {
      const f = await setup();
      try {
        const a = await f.first.banking.createLinkIntent.mutate({
          holderType: "individual",
        });
        const b = await f.first.banking.createLinkIntent.mutate({
          holderType: "individual",
        });
        await expect(
          f.complete({ ...a, widgetToken: b.widgetToken }),
        ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
        expect(f.state.exchanges).toBe(0);
        const result = await Promise.allSettled([f.complete(a), f.complete(a)]);
        expect(result.some((item) => item.status === "fulfilled")).toBe(true);
        expect(f.state.exchanges).toBe(1);
        expect(await f.first.banking.connections.query()).toHaveLength(1);
      } finally {
        await f.close();
      }
    });

    it("preserves the stable connection/accounts on relink and supersedes old ingestion revisions", async () => {
      const f = await setup();
      try {
        const connected = await f.complete(
          await f.first.banking.createLinkIntent.mutate({
            holderType: "individual",
          }),
        );
        const account = await f.db.insert("account", {
          userId: f.userId,
          providerConnectionId: connected.id,
          type: "checking",
          alias: "Keep this alias",
          balance: "25.00",
        });
        const sync = await f.persistence
          .user(f.userId)
          .providerSync.begin.mutate({
            connectionId: connected.id,
            provider: "fintoc",
            expectedCredentialVersion: 0,
          });
        f.state.link.status = "login_required";
        expect(
          (await f.first.banking.checkConnection.mutate({ id: connected.id }))
            .status,
        ).toBe("expired");
        const intent = await f.first.banking.createLinkIntent.mutate({
          holderType: "individual",
          connectionId: connected.id,
        });
        f.state.link.status = "active";
        f.state.link.link_token = `${f.state.link.id}_token_replaced`;
        expect(await f.complete(intent)).toMatchObject({
          id: connected.id,
          status: "active",
        });
        expect(
          (await f.db.rows("account", { id: account.id }))[0],
        ).toMatchObject({ alias: "Keep this alias", balance: "25.00" });
        expect(
          await f.persistence.user(f.userId).providerSync.failure.mutate({
            connectionId: connected.id,
            revision: sync.revision,
            observedAt: new Date().toISOString(),
            reason: "expired",
            retryAfter: null,
          }),
        ).toEqual({ status: "superseded" });
        const secret = await f.persistence
          .user(f.userId)
          .providerLinks.connection.query({ id: connected.id });
        expect(
          new FintocCredentials(f.environment).open(
            secret.encryptedCredential ?? "",
            f.userId,
            "test",
            secret.externalId,
          ),
        ).toBe(f.state.link.link_token);
      } finally {
        await f.close();
      }
    });

    it("never reassigns a hidden foreign connection or accepts foreign related references", async () => {
      const f = await setup();
      try {
        const connected = await f.complete(
          await f.first.banking.createLinkIntent.mutate({
            holderType: "individual",
          }),
        );
        const foreign = await f.other.banking.createLinkIntent.mutate({
          holderType: "individual",
        });
        await expect(f.complete(foreign, f.other)).rejects.toMatchObject({
          data: { code: "CONFLICT" },
        });
        expect(await f.other.banking.connections.query()).toEqual([]);
        expect(
          (await f.db.rows("provider_connection", { id: connected.id }))[0]
            .user_id,
        ).toBe(f.userId);
        await expect(
          f.persistence.user(f.otherUserId).providerLinks.createIntent.mutate({
            id: randomUUID(),
            providerIntentId: `li_${randomUUID()}`,
            holderType: "individual",
            mode: "test",
            connectionId: connected.id,
            expectedVersion: 0,
          }),
        ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      } finally {
        await f.close();
      }
    });

    it("keeps ambiguous exchanges failed without replay and never overwrites a committed completion with late failure reporting", async () => {
      const f = await setup();
      try {
        const intent = await f.first.banking.createLinkIntent.mutate({
          holderType: "individual",
        });
        f.state.failExchange = true;
        await expect(f.complete(intent)).rejects.toMatchObject({
          data: { code: "SERVICE_UNAVAILABLE" },
        });
        await expect(f.complete(intent)).rejects.toMatchObject({
          data: { code: "CONFLICT" },
        });
        expect(f.state.exchanges).toBe(1);
        const succeeded = await f.first.banking.createLinkIntent.mutate({
          holderType: "individual",
        });
        f.state.failExchange = false;
        const connected = await f.complete(succeeded);
        const [row] = await f.db.rows("provider_link_intent", {
          id: succeeded.id,
        });
        await f.persistence.user(f.userId).providerLinks.fail.mutate({
          id: succeeded.id,
          exchangeTokenHash: row.exchange_token_hash ?? "",
        });
        expect(await f.complete(succeeded)).toEqual(connected);
        expect(f.state.exchanges).toBe(2);
      } finally {
        await f.close();
      }
    });

    it("disables locally, reports pending remote revocation, then clears secrets without deleting financial history", async () => {
      const f = await setup();
      try {
        const connected = await f.complete(
          await f.first.banking.createLinkIntent.mutate({
            holderType: "individual",
          }),
        );
        const account = await f.db.insert("account", {
          userId: f.userId,
          providerConnectionId: connected.id,
          type: "checking",
          balance: "25.00",
        });
        const pendingIntent = await f.first.banking.createLinkIntent.mutate({
          holderType: "individual",
          connectionId: connected.id,
        });
        f.state.failDelete = true;
        await expect(
          f.first.banking.disconnect.mutate({ id: connected.id }),
        ).rejects.toMatchObject({ data: { code: "SERVICE_UNAVAILABLE" } });
        expect(await f.first.banking.connections.query()).toMatchObject([
          { status: "revoked", disconnectPending: true },
        ]);
        await expect(f.complete(pendingIntent)).rejects.toMatchObject({
          data: { code: "CONFLICT" },
        });
        await expect(
          f.persistence.user(f.userId).providerSync.begin.mutate({
            connectionId: connected.id,
            provider: "fintoc",
            expectedCredentialVersion: 1,
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        f.state.failDelete = false;
        expect(
          await f.first.banking.disconnect.mutate({ id: connected.id }),
        ).toMatchObject({ status: "revoked", disconnectPending: false });
        const deletes = f.state.deletes;
        await f.first.banking.disconnect.mutate({ id: connected.id });
        expect(f.state.deletes).toBe(deletes);
        expect(
          (await f.db.rows("provider_connection", { id: connected.id }))[0]
            .encrypted_credential,
        ).toBeNull();
        expect(await f.db.rows("account", { id: account.id })).toHaveLength(1);
      } finally {
        await f.close();
      }
    });

    it("disables locally even without configured provider keys and lets a configured API reconcile remote cleanup", async () => {
      const f = await setup();
      const offline = await startApi(
        { ...f, environment: testEnvironment() },
        false,
        f.fetch,
      );
      try {
        const connected = await f.complete(
          await f.first.banking.createLinkIntent.mutate({
            holderType: "individual",
          }),
        );
        await expect(
          offline.client().banking.disconnect.mutate({ id: connected.id }),
        ).rejects.toMatchObject({ data: { code: "SERVICE_UNAVAILABLE" } });
        expect(await f.first.banking.connections.query()).toMatchObject([
          { id: connected.id, status: "revoked", disconnectPending: true },
        ]);
        expect(f.state.deletes).toBe(0);
        expect(
          await f.first.banking.disconnect.mutate({ id: connected.id }),
        ).toMatchObject({ status: "revoked", disconnectPending: false });
        expect(f.state.deletes).toBe(1);
      } finally {
        await offline.app.close();
        await f.close();
      }
    });

    it("rejects a late relink result after the owner disconnects during its exchange", async () => {
      const f = await setup();
      const entered = signal(),
        release = signal();
      try {
        const connected = await f.complete(
          await f.first.banking.createLinkIntent.mutate({
            holderType: "individual",
          }),
        );
        const relink = await f.first.banking.createLinkIntent.mutate({
          holderType: "individual",
          connectionId: connected.id,
        });
        f.onExchange.mockImplementationOnce(async () => {
          entered.resolve();
          await release.promise;
        });
        const late = expect(f.complete(relink)).rejects.toMatchObject({
          data: { code: "CONFLICT" },
        });
        await entered.promise;
        await f.first.banking.disconnect.mutate({ id: connected.id });
        release.resolve();
        await late;
        expect(await f.first.banking.connections.query()).toMatchObject([
          { id: connected.id, status: "revoked", disconnectPending: false },
        ]);
        expect(
          (await f.db.rows("provider_connection", { id: connected.id }))[0]
            .encrypted_credential,
        ).toBeNull();
      } finally {
        release.resolve();
        await f.close();
      }
    });

    it("rejects a stale active-status response after disconnect instead of reactivating access", async () => {
      const f = await setup();
      const entered = signal(),
        release = signal();
      try {
        const connected = await f.complete(
          await f.first.banking.createLinkIntent.mutate({
            holderType: "individual",
          }),
        );
        f.onCheck.mockImplementationOnce(async () => {
          entered.resolve();
          await release.promise;
        });
        const late = expect(
          f.first.banking.checkConnection.mutate({ id: connected.id }),
        ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
        await entered.promise;
        await f.first.banking.disconnect.mutate({ id: connected.id });
        release.resolve();
        await late;
        expect(
          await f.first.banking.checkConnection.mutate({ id: connected.id }),
        ).toMatchObject({ status: "revoked", disconnectPending: false });
      } finally {
        release.resolve();
        await f.close();
      }
    });

    it("refuses a different relink identity, mode or holder type without replacing the saved connection", async () => {
      const f = await setup();
      try {
        const connected = await f.complete(
          await f.first.banking.createLinkIntent.mutate({
            holderType: "individual",
          }),
        );
        const before = (
          await f.db.rows("provider_connection", { id: connected.id })
        )[0];
        const calls = f.fetch.mock.calls.length;
        await expect(
          f.first.banking.createLinkIntent.mutate({
            holderType: "business",
            connectionId: connected.id,
          }),
        ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
        expect(f.fetch.mock.calls).toHaveLength(calls);
        await expect(
          f.persistence.user(f.userId).providerLinks.createIntent.mutate({
            id: randomUUID(),
            providerIntentId: `li_${randomUUID()}`,
            holderType: "individual",
            mode: "live",
            connectionId: connected.id,
            expectedVersion: 0,
          }),
        ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
        const intent = await f.first.banking.createLinkIntent.mutate({
          holderType: "individual",
          connectionId: connected.id,
        });
        f.state.link.id = "link_different";
        f.state.link.link_token = "link_different_token_private";
        await expect(f.complete(intent)).rejects.toMatchObject({
          data: { code: "CONFLICT" },
        });
        expect(
          (await f.db.rows("provider_connection", { id: connected.id }))[0],
        ).toEqual(before);
        expect(await f.first.banking.connections.query()).toEqual([connected]);
      } finally {
        await f.close();
      }
    });

    it("enforces intent expiry and pending limits before exchange", async () => {
      const f = await setup();
      try {
        const intent = await f.first.banking.createLinkIntent.mutate({
          holderType: "individual",
        });
        await f.db.update("provider_link_intent", intent.id, {
          expiresAt: "2020-01-01T00:00:00.000Z",
        });
        await expect(f.complete(intent)).rejects.toMatchObject({
          data: { code: "CONFLICT" },
        });
        expect(f.state.exchanges).toBe(0);
        for (let i = 0; i < 10; i++)
          await f.first.banking.createLinkIntent.mutate({
            holderType: "individual",
          });
        await expect(
          f.first.banking.createLinkIntent.mutate({ holderType: "individual" }),
        ).rejects.toMatchObject({ data: { code: "TOO_MANY_REQUESTS" } });
      } finally {
        await f.close();
      }
    });
  },
);
