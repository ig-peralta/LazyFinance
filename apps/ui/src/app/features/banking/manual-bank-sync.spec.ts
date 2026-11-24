import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bankingConfiguration,
  bankingConnection,
  bankingImportResult,
  bankingSyncStatus,
} from "../../../testing/banking";
import { deferred } from "../../../testing/deferred";
import {
  movement,
  principal,
  type RpcOutput,
  rpcFailure,
  setupRpc,
} from "../../../testing/rpc";
import { ManualBankSync } from "./manual-bank-sync";

const id = (suffix: number) => `00000000-0000-4000-8000-0000000001${suffix}`;
const previous = "2026-11-08T17:30:00.000Z";

describe("explicit financial synchronization", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("serializes eligible imports, coalesces clicks and reports skipped banks without sending mutations", async () => {
    const first = deferred<RpcOutput<"banking.importInitial">>();
    const next = { ...bankingConnection, id: id(10) };
    const deferredBank = { ...bankingConnection, id: id(11) };
    const expired = {
      ...bankingConnection,
      id: id(12),
      status: "expired" as const,
    };
    const otherMode = {
      ...bankingConnection,
      id: id(13),
      mode: "live" as const,
    };
    const mock = setupRpc({
      "banking.configuration": () => bankingConfiguration,
      "banking.connections": () => [
        bankingConnection,
        deferredBank,
        expired,
        otherMode,
        next,
      ],
      "banking.syncStatus": ({ id }) =>
        bankingSyncStatus({
          connectionId: id,
          ...(id === next.id ? { lastSuccessAt: previous } : {}),
          ...(id === deferredBank.id
            ? {
                canRefresh: false,
                failure: {
                  at: previous,
                  reason: "retryable",
                  retryAfter: "2026-11-08T18:10:00.000Z",
                },
              }
            : {}),
        }),
      "banking.importInitial": () => first.promise,
      "banking.refresh": () => ({
        ...bankingImportResult,
        status: "needs_review",
        conflictCount: 1,
      }),
    });
    const sync = TestBed.inject(ManualBankSync);
    expect(mock.calls).toEqual([]);
    const request = sync.start();
    expect(sync.running()).toBe(true);
    await vi.waitFor(() =>
      expect(mock.callsTo("banking.importInitial")).toHaveLength(1),
    );
    await sync.start();
    expect(mock.callsTo("banking.connections")).toHaveLength(1);
    expect(mock.callsTo("banking.refresh")).toHaveLength(0);
    expect(sync.revision()).toBe(0);
    first.resolve(bankingImportResult);
    await request;
    expect(
      mock.callsTo("banking.refresh").map((call) => call.input.id),
    ).toEqual([next.id]);
    expect(sync.revision()).toBe(2);
    expect(sync.report()?.results.map(({ result }) => result.status)).toEqual([
      "complete",
      "retry_later",
      "access",
      "configuration",
      "needs_review",
    ]);
    expect(sync.running()).toBe(false);
  });

  it.each([
    true,
    false,
  ])("read-reconciles a lost reply without replaying it (committed: %s)", async (committed) => {
    let attempted = false;
    const mock = setupRpc({
      "banking.configuration": () => bankingConfiguration,
      "banking.connections": () => [bankingConnection],
      "banking.syncStatus": () =>
        bankingSyncStatus({
          lastSuccessAt:
            attempted && committed ? "2026-11-08T18:00:01.000Z" : previous,
          lastResult: "complete",
        }),
      "banking.refresh": () => {
        attempted = true;
        return rpcFailure();
      },
    });
    const sync = TestBed.inject(ManualBankSync);
    await sync.start();
    expect(mock.callsTo("banking.refresh")).toHaveLength(1);
    expect(mock.callsTo("banking.syncStatus")).toHaveLength(2);
    expect(sync.revision()).toBe(committed ? 1 : 0);
    expect(sync.report()?.results[0]?.result.status).toBe(
      committed ? "complete" : "unconfirmed",
    );
  });

  it("refreshes only the movement's own connection, never all banks when no account matches", async () => {
    const other = { ...bankingConnection, id: id(10) };
    const mock = setupRpc({
      "banking.configuration": () => bankingConfiguration,
      "banking.connections": () => [other, bankingConnection],
      "banking.syncStatus": () =>
        bankingSyncStatus({
          lastSuccessAt: previous,
          accounts: [
            {
              id: movement.account.id,
              type: "checking",
              freshness: "stale",
              balanceAsOf: null,
              historyCoverage: {
                completeness: "partial",
                from: null,
                through: null,
              },
            },
          ],
        }),
      "banking.refresh": () => bankingImportResult,
    });
    // The first status response belongs to a different bank and is rejected.
    const sync = TestBed.inject(ManualBankSync);
    await sync.start(movement.account.id);
    await sync.start(id(11));
    expect(
      mock.callsTo("banking.refresh").map((call) => call.input.id),
    ).toEqual([bankingConnection.id]);
    expect(sync.report()?.results).toEqual([]);
  });

  it("doesn't send remaining imports or adopt a late commit after the credential scope changes", async () => {
    const reply = deferred<RpcOutput<"banking.refresh">>();
    const mock = setupRpc({
      "banking.configuration": () => bankingConfiguration,
      "banking.connections": () => [
        bankingConnection,
        { ...bankingConnection, id: id(10) },
      ],
      "banking.syncStatus": ({ id }) =>
        bankingSyncStatus({ connectionId: id, lastSuccessAt: previous }),
      "banking.refresh": () => reply.promise,
    });
    const sync = TestBed.inject(ManualBankSync);
    const request = sync.start();
    await vi.waitFor(() =>
      expect(mock.callsTo("banking.refresh")).toHaveLength(1),
    );
    mock.credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    reply.resolve(bankingImportResult);
    await request;
    expect(mock.callsTo("banking.refresh")[0].options?.signal?.aborted).toBe(
      true,
    );
    expect(mock.callsTo("banking.refresh")).toHaveLength(1);
    expect(sync.revision()).toBe(0);
    expect(sync.report()).toBeUndefined();
    expect(sync.busy()).toBe(false);
  });
});
