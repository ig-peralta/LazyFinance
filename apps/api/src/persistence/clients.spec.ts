import type { MovementAggregate } from "@lazyfinance/contracts/internal";
import { describe, expect, it, vi } from "vitest";
import { AccountClient } from "./accounts.client";
import { ObjectiveClient } from "./objectives.client";
import type { PersistenceClient } from "./persistence.client";
import { TagClient } from "./tags.client";
import { movementTotals, TransactionClient } from "./transactions.client";

describe("typed factual clients (replaces API SQL-query unit tests)", () => {
  it("preserves missing balances and parses only timestamps", async () => {
    const user = vi.fn(() => ({
      accounts: {
        listActive: {
          query: async () => [
            {
              id: "one",
              balance: "9007199254740.99",
              lastSyncedAt: "2026-10-15T15:00:00.000Z",
            },
            { id: "two", balance: null, lastSyncedAt: null },
          ],
        },
      },
    }));
    const rows = await new AccountClient({
      user,
    } as unknown as PersistenceClient).listActiveForUser("owner");
    expect(user).toHaveBeenCalledWith("owner");
    expect(rows).toEqual([
      {
        id: "one",
        balance: "9007199254740.99",
        lastSyncedAt: new Date("2026-10-15T15:00:00Z"),
      },
      { id: "two", balance: null, lastSyncedAt: null },
    ]);
  });
  it("interprets stored dimensions without counting transfers, uncertain movements or review conflicts", () => {
    const group = (update: Partial<MovementAggregate>): MovementAggregate => ({
      type: "credit",
      isInternalMovement: false,
      reviewStatus: "clear",
      hasReceipt: false,
      tagId: null,
      amount: "10.01",
      count: 1,
      ...update,
    });
    expect(
      movementTotals([
        group({ hasReceipt: true, amount: "9007199254740.99" }),
        group({ amount: "2.02", count: 2 }),
        group({ type: "debit", amount: "-20.03" }),
        group({ isInternalMovement: true, amount: "1000.00" }),
        group({ isInternalMovement: null, count: 3 }),
        group({ reviewStatus: "needs_review", hasReceipt: true, count: 2 }),
      ]),
    ).toEqual({
      receivedIncome: "9007199254740.99",
      unclassifiedCreditAmount: "2.02",
      unclassifiedCreditCount: 2,
      spending: "20.03",
      unresolvedMovementCount: 5,
    });
    expect(movementTotals([])).toEqual({
      receivedIncome: "0.00",
      unclassifiedCreditAmount: "0.00",
      unclassifiedCreditCount: 0,
      spending: "0.00",
      unresolvedMovementCount: 0,
    });
  });
  it("requests half-open Santiago calendar boundaries and the explicit current-month cutoff", async () => {
    const query = vi.fn(async () => []);
    const client = new TransactionClient({
      user: () => ({
        transactions: { aggregates: { query }, taggedDebits: { query } },
      }),
    } as unknown as PersistenceClient);
    const now = new Date("2026-10-16T15:00:00.000Z");
    await client.sumByMonthForUser("owner", "2026-12");
    expect(query).toHaveBeenLastCalledWith({
      start: "2026-12-01 00:00:00",
      end: "2027-01-01 00:00:00",
      asOf: undefined,
    });
    await client.sumByMonthForUser("owner", "2026-10", now);
    expect(query).toHaveBeenLastCalledWith({
      start: "2026-10-01 00:00:00",
      end: "2026-11-01 00:00:00",
      asOf: now.toISOString(),
    });
    await client.listTaggedDebitsForPeriod(
      "owner",
      "2026-01-01 00:00:00",
      "2026-10-01 00:00:00",
    );
    expect(query).toHaveBeenLastCalledWith({
      start: "2026-01-01 00:00:00",
      end: "2026-10-01 00:00:00",
      asOf: undefined,
    });
  });
  it("preserves recent ordering/tag facts and rehydrates objective dates", async () => {
    const user = vi.fn(() => ({
      transactions: {
        recent: {
          query: async () => [
            { id: "recent", bookedAt: "2026-10-15T15:00:00Z", tag: null },
          ],
        },
      },
      objectives: {
        list: {
          query: async () => [
            { id: "budget", startDate: "2024-01-01T15:00:00Z", endDate: null },
          ],
        },
      },
    }));
    const persistence = { user } as unknown as PersistenceClient;
    expect(
      await new TransactionClient(persistence).listRecentForUser("owner"),
    ).toEqual([
      { id: "recent", bookedAt: new Date("2026-10-15T15:00:00Z"), tag: null },
    ]);
    expect(await new ObjectiveClient(persistence).listForUser("owner")).toEqual(
      [
        {
          id: "budget",
          startDate: new Date("2024-01-01T15:00:00Z"),
          endDate: null,
        },
      ],
    );
  });
  it("combines eligible tagged debits, includes historical archived tags, and sorts by exact amount", async () => {
    const tags = [
      { id: "a", name: "A", color: null, isArchived: true },
      { id: "b", name: "B", color: null, isArchived: false },
    ];
    const query = vi.fn(async () => []);
    const persistence = {
      user: () => ({
        tags: { list: { query: async () => tags } },
        objectives: { tags: { query } },
        transactions: {
          aggregates: {
            query: async () => [
              {
                tagId: "a",
                type: "debit",
                isInternalMovement: false,
                reviewStatus: "clear",
                amount: "-10.02",
                count: 2,
              },
              {
                tagId: "a",
                type: "debit",
                isInternalMovement: false,
                reviewStatus: "clear",
                amount: "-1.00",
                count: 1,
              },
              {
                tagId: "b",
                type: "debit",
                isInternalMovement: true,
                reviewStatus: "clear",
                amount: "-9999.00",
                count: 1,
              },
            ],
          },
        },
      }),
    } as unknown as PersistenceClient;
    const client = new TagClient(persistence);
    expect(await client.sumDebitsByTagForMonth("owner", "2026-09")).toEqual([
      { id: "a", name: "A", color: null, amount: "11.02", count: 3 },
    ]);
    await client.listForObjectives("owner", ["budget"]);
    expect(query).toHaveBeenCalledWith({ ids: ["budget"] });
  });
});
