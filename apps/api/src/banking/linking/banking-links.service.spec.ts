import type { ProviderLinkSecret } from "@lazyfinance/contracts/internal";
import { describe, expect, it, vi } from "vitest";
import {
  bankingConnection,
  fintocEnvironment,
  fintocIntent,
  fintocLink,
  storedLink,
} from "../../../tests/fixtures/banking/fintoc";
import { testEnvironment } from "../../../tests/fixtures/environment";
import type { RpcStubs } from "../../../tests/fixtures/rpc-stubs";
import type { PersistenceClient } from "../../persistence/persistence.client";
import { FintocClient } from "../fintoc/fintoc-client";
import { FintocCredentials } from "../fintoc/fintoc-credentials";
import { BankingLinksService } from "./banking-links.service";

type Store = RpcStubs<ReturnType<PersistenceClient["user"]>["providerLinks"]>;
function setup(providerEnvironment = fintocEnvironment()) {
  const vault = new FintocCredentials(fintocEnvironment());
  const secret: ProviderLinkSecret = {
    ...storedLink,
    encryptedCredential: vault.seal(
      fintocLink.link_token,
      "alice",
      "test",
      fintocLink.id,
    ),
  };
  const disconnected = {
    ...bankingConnection,
    status: "revoked" as const,
    disconnectedAt: "2026-11-08T16:00:00.000Z",
    disconnectPending: true,
  };
  const rpc = {
    list: {
      query: vi.fn<Store["list"]["query"]>(async () => [bankingConnection]),
    },
    connection: {
      query: vi.fn<Store["connection"]["query"]>(async () => secret),
    },
    createIntent: {
      mutate: vi.fn<Store["createIntent"]["mutate"]>(async () => ({
        expiresAt: "2026-11-08T16:20:00.000Z",
      })),
    },
    claim: {
      mutate: vi.fn<Store["claim"]["mutate"]>(async () => ({
        state: "claimed",
        mode: "test",
        holderType: "individual",
      })),
    },
    complete: {
      mutate: vi.fn<Store["complete"]["mutate"]>(async () => bankingConnection),
    },
    fail: {
      mutate: vi.fn<Store["fail"]["mutate"]>(async () => ({ state: "failed" })),
    },
    status: {
      mutate: vi.fn<Store["status"]["mutate"]>(async ({ status }) => ({
        ...bankingConnection,
        status,
      })),
    },
    beginDisconnect: {
      mutate: vi.fn<Store["beginDisconnect"]["mutate"]>(async () => ({
        ...secret,
        connection: disconnected,
        version: 1,
      })),
    },
    finishDisconnect: {
      mutate: vi.fn<Store["finishDisconnect"]["mutate"]>(async () => ({
        ...disconnected,
        disconnectPending: false,
      })),
    },
  } satisfies Store;
  const persistence = {
    user: vi.fn((_userId: string) => ({ providerLinks: rpc })),
  };
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json(fintocLink),
  );
  const service = new BankingLinksService(
    persistence as unknown as PersistenceClient,
    new FintocClient(providerEnvironment, fetch),
    vault,
  );
  return { service, rpc, fetch, vault, persistence, secret };
}

describe("owned Fintoc linking orchestration", () => {
  it("creates owned intents and stores encrypted credentials, never returning link tokens", async () => {
    const f = setup();
    f.fetch
      .mockResolvedValueOnce(Response.json(fintocIntent))
      .mockResolvedValueOnce(Response.json(fintocLink));
    const intent = await f.service.createIntent("alice", {
      holderType: "individual",
    });
    expect(intent).toMatchObject({
      widgetToken: fintocIntent.widget_token,
      publicKey: "pk_test_fixture",
    });
    const connected = await f.service.complete("alice", {
      id: intent.id,
      exchangeToken: "li_fixture_exc_authorization",
    });
    expect(connected).toEqual(bankingConnection);
    expect(JSON.stringify(connected)).not.toContain("token_private");
    const saved = f.rpc.complete.mutate.mock.calls[0][0];
    expect(
      f.vault.open(
        saved.encryptedCredential,
        "alice",
        "test",
        saved.externalId,
      ),
    ).toBe(fintocLink.link_token);
    expect(f.rpc.claim.mutate.mock.calls[0][0]).toMatchObject({
      id: intent.id,
      providerIntentId: "li_fixture",
    });
    expect(
      f.persistence.user.mock.calls.every(([owner]) => owner === "alice"),
    ).toBe(true);
  });

  it("returns completed callback results without exchanging twice", async () => {
    const f = setup();
    f.rpc.claim.mutate.mockResolvedValueOnce({
      state: "completed",
      connection: bankingConnection,
    });
    await expect(
      f.service.complete("alice", {
        id: bankingConnection.id,
        exchangeToken: "li_fixture_exc_authorization",
      }),
    ).resolves.toEqual(bankingConnection);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.rpc.complete.mutate).not.toHaveBeenCalled();
  });

  it("makes no provider request for foreign/processing intents, malformed tokens or foreign relink/disconnect IDs", async () => {
    const f = setup();
    await expect(
      f.service.complete("alice", {
        id: bankingConnection.id,
        exchangeToken: "link_other_token_private",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    f.rpc.claim.mutate.mockRejectedValueOnce(
      new Error("Owned intent not found"),
    );
    await expect(
      f.service.complete("alice", {
        id: bankingConnection.id,
        exchangeToken: "li_other_exc_private",
      }),
    ).rejects.toThrow("Owned intent not found");
    f.rpc.connection.query.mockRejectedValue(
      new Error("Owned connection not found"),
    );
    await expect(
      f.service.createIntent("alice", {
        holderType: "individual",
        connectionId: bankingConnection.id,
      }),
    ).rejects.toThrow();
    await expect(
      f.service.disconnect("alice", bankingConnection.id),
    ).rejects.toThrow();
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("marks ambiguous exchanges uncertain without retrying or revealing upstream tokens", async () => {
    const f = setup();
    f.fetch.mockRejectedValueOnce(
      new Error("URL contains private exchange token"),
    );
    await expect(
      f.service.complete("alice", {
        id: bankingConnection.id,
        exchangeToken: "li_fixture_exc_authorization",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.rpc.fail.mutate).toHaveBeenCalledOnce();
    expect(f.rpc.complete.mutate).not.toHaveBeenCalled();
  });

  it("does not retry an uncertain persistence completion", async () => {
    const f = setup();
    f.rpc.complete.mutate.mockRejectedValueOnce(
      new Error("Lost commit response"),
    );
    await expect(
      f.service.complete("alice", {
        id: bankingConnection.id,
        exchangeToken: "li_fixture_exc_authorization",
      }),
    ).rejects.toThrow("Lost commit response");
    expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.rpc.complete.mutate).toHaveBeenCalledOnce();
  });

  it("maps login_required to expired, and a missing link to revoked without treating server auth outages as revocation", async () => {
    const f = setup();
    f.fetch
      .mockResolvedValueOnce(
        Response.json({
          ...fintocLink,
          status: "login_required",
          link_token: null,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await f.service.check("alice", bankingConnection.id)).status).toBe(
      "expired",
    );
    expect((await f.service.check("alice", bankingConnection.id)).status).toBe(
      "revoked",
    );
    await expect(
      f.service.check("alice", bankingConnection.id),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(f.rpc.status.mutate).toHaveBeenCalledTimes(2);
  });

  it("disables locally before remote revocation and leaves failed revocations pending for explicit reconciliation", async () => {
    const f = setup();
    f.fetch
      .mockImplementationOnce(async () => {
        expect(f.rpc.beginDisconnect.mutate).toHaveBeenCalledOnce();
        return new Response(null, { status: 500 });
      })
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(
      f.service.disconnect("alice", bankingConnection.id),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(f.rpc.finishDisconnect.mutate).not.toHaveBeenCalled();
    expect(
      (await f.service.disconnect("alice", bankingConnection.id))
        .disconnectPending,
    ).toBe(false);
    expect(f.rpc.finishDisconnect.mutate.mock.calls[0][0]).toEqual({
      id: bankingConnection.id,
      expectedVersion: 1,
    });
  });

  it("still disables locally when provider configuration is absent", async () => {
    const f = setup(testEnvironment());
    await expect(
      f.service.disconnect("alice", bankingConnection.id),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(f.rpc.beginDisconnect.mutate).toHaveBeenCalledOnce();
    expect(f.rpc.finishDisconnect.mutate).not.toHaveBeenCalled();
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it.each([
    { mode: "live" },
    { holder_type: "business" },
  ])("rejects provider mode/holder mismatch %j without persisting credentials", async (mismatch) => {
    const f = setup();
    f.fetch.mockResolvedValueOnce(
      Response.json({ ...fintocLink, ...mismatch }),
    );
    await expect(
      f.service.complete("alice", {
        id: bankingConnection.id,
        exchangeToken: "li_fixture_exc_authorization",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(f.rpc.complete.mutate).not.toHaveBeenCalled();
  });
});
