import { randomUUID } from "node:crypto";
import type { ProviderSyncFacts } from "@lazyfinance/contracts/internal";
import { TRPCClientError } from "@trpc/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersistenceClient } from "../../persistence/persistence.client";
import { initialPage } from "../connector/fixtures/normalized-pages";
import {
  type ConnectorPage,
  ConnectorPageSchema,
} from "../connector/normalized-banking.schema";
import { BankingIngestionService } from "./banking-ingestion.service";
import { prepareSync, syncScope } from "./prepare-sync";

// Byte-limit control-flow tests use smaller budgets, not a claim of load testing.
const limits = vi.hoisted(() => ({
  normalized: 32 * 1024 * 1024,
  prepared: 64 * 1024 * 1024,
}));

vi.mock("@lazyfinance/contracts/internal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lazyfinance/contracts/internal")>()),
  get MAX_NORMALIZED_SYNC_BYTES() {
    return limits.normalized;
  },
  get MAX_PERSISTENCE_RPC_BYTES() {
    return limits.prepared;
  },
}));

afterEach(() => {
  limits.normalized = 32 * 1024 * 1024;
  limits.prepared = 64 * 1024 * 1024;
});

const page = (): ConnectorPage => ({
  ...initialPage,
  accounts: [initialPage.accounts[0]],
  movements: [initialPage.movements[1]],
  removedMovements: [],
});

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

function setup(pages = [page()]) {
  const connectionId = randomUUID();
  const facts: ProviderSyncFacts = {
    state: {
      providerConnectionId: connectionId,
      revision: 0,
      checkpoint: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastProviderObservedAt: null,
      lastResult: null,
      unresolvedConflictCount: 0,
      lastFailureAt: null,
      lastFailureReason: null,
      retryAfter: null,
    },
    accounts: [],
    movements: [],
    removals: [],
    receiptTransactionIds: [],
    rules: [],
    fingerprint: "0".repeat(64),
  };
  const rpc = {
    begin: { mutate: vi.fn(async () => facts.state) },
    facts: { query: vi.fn(async () => facts) },
    commit: {
      mutate: vi.fn(async () => ({
        status: "complete",
        conflictCount: 0,
        checkpoint: "saved",
      })),
    },
    failure: {
      mutate: vi.fn(async () => ({
        status: "failed",
        reason: "invalid_data",
        retryAfter: null,
      })),
    },
  };
  const fetchPage = vi.fn(async () => pages.shift()!);
  const service = new BankingIngestionService({
    user: () => ({ providerSync: rpc }),
  } as unknown as PersistenceClient);

  return {
    rpc,
    fetchPage,
    facts,
    connectionId,
    run: () =>
      service.syncForUser(randomUUID(), connectionId, {
        provider: "fixture",
        fetchPage,
      }),
  };
}

function pagination(count: number): ConnectorPage[] {
  return Array.from({ length: count }, (_, index) => ({
    ...page(),
    accounts: [],
    movements: [],
    complete: index === count - 1,
    nextCursor: index === count - 1 ? null : String(index),
    checkpoint: index === count - 1 ? "end" : null,
  }));
}

describe("provider run budgets and retry safety", () => {
  it("accepts the normalized/prepared byte boundaries without splitting a commit", async () => {
    const value = ConnectorPageSchema.parse(page()),
      f = setup([value]);
    limits.normalized = bytes(value);
    limits.prepared = bytes(
      prepareSync(syncScope(f.connectionId, 0, [value]), f.facts, [value]),
    );
    await expect(f.run()).resolves.toMatchObject({ status: "complete" });
    expect(f.rpc.commit.mutate).toHaveBeenCalledOnce();
    expect(f.rpc.failure.mutate).not.toHaveBeenCalled();
  });
  it("counts normalized UTF-8 bytes rather than string characters", async () => {
    const ascii = page();
    ascii.movements[0] = {
      ...ascii.movements[0],
      description: "a".repeat(240),
    };
    limits.normalized = bytes(ConnectorPageSchema.parse(ascii));
    const unicode = page();
    unicode.movements[0] = {
      ...unicode.movements[0],
      description: "界".repeat(240),
    };
    const f = setup([unicode]);
    await expect(f.run()).resolves.toMatchObject({
      status: "failed",
      reason: "invalid_data",
    });
    expect(f.rpc.facts.query).not.toHaveBeenCalled();
    expect(f.rpc.commit.mutate).not.toHaveBeenCalled();
  });
  it("accumulates normalized bytes across pages and rejects before factual reads", async () => {
    const pages = pagination(2);
    limits.normalized = bytes(pages[0]) + bytes(pages[1]) - 1;
    const f = setup(pages);
    await expect(f.run()).resolves.toMatchObject({
      status: "failed",
      reason: "invalid_data",
    });
    expect(f.rpc.facts.query).not.toHaveBeenCalled();
    expect(f.rpc.commit.mutate).not.toHaveBeenCalled();
  });
  it("rejects prepared-byte overflow without submitting any financial commit", async () => {
    const value = page(),
      f = setup([value]);
    limits.prepared =
      bytes(
        prepareSync(syncScope(f.connectionId, 0, [value]), f.facts, [value]),
      ) - 1;
    await expect(f.run()).resolves.toMatchObject({
      status: "failed",
      reason: "invalid_data",
    });
    expect(f.rpc.facts.query).toHaveBeenCalledOnce();
    expect(f.rpc.commit.mutate).not.toHaveBeenCalled();
  });
  it("accepts exactly 100 pages and rejects a run requiring a 101st page", async () => {
    const allowed = setup(pagination(100));
    await expect(allowed.run()).resolves.toMatchObject({ status: "complete" });
    expect(allowed.fetchPage).toHaveBeenCalledTimes(100);
    const excess = setup(pagination(101));
    await expect(excess.run()).resolves.toMatchObject({
      status: "failed",
      reason: "invalid_data",
    });
    expect(excess.fetchPage).toHaveBeenCalledTimes(100);
    expect(excess.rpc.commit.mutate).not.toHaveBeenCalled();
  });
  it("rejects more than 50,000 combined records, even when each page is within the count", async () => {
    const first = page();
    first.accounts = Array.from({ length: 25000 }, (_, i) => ({
      ...initialPage.accounts[0],
      externalId: `account-${i}`,
    }));
    first.movements = [];
    first.complete = false;
    first.checkpoint = null;
    first.nextCursor = "next";
    const second = {
      ...first,
      accounts: [
        ...first.accounts,
        { ...initialPage.accounts[0], externalId: "extra" },
      ],
      complete: true,
      nextCursor: null,
    };
    const f = setup([first, second]);
    await expect(f.run()).resolves.toMatchObject({
      status: "failed",
      reason: "invalid_data",
    });
    expect(f.fetchPage).toHaveBeenCalledTimes(2);
    expect(f.rpc.facts.query).not.toHaveBeenCalled();
    expect(f.rpc.commit.mutate).not.toHaveBeenCalled();
  });
  it("does not retry an ambiguous failed commit", async () => {
    const f = setup();
    f.rpc.commit.mutate.mockRejectedValueOnce(
      new TRPCClientError("socket closed after write"),
    );
    await expect(f.run()).rejects.toThrow("socket closed after write");
    expect(f.rpc.commit.mutate).toHaveBeenCalledOnce();
    expect(f.rpc.facts.query).toHaveBeenCalledOnce();
    expect(f.rpc.failure.mutate).not.toHaveBeenCalled();
  });
});
