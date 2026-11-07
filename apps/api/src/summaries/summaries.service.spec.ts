import type { TaggedMovementAggregate } from "@lazyfinance/contracts/internal";
import { describe, expect, it, vi } from "vitest";
import { movementAggregate } from "../../tests/fixtures/movement-aggregate";
import type { RpcStubs } from "../../tests/fixtures/rpc-stubs";
import type { IncomeService } from "../income/income.service";
import type { PersistenceClient } from "../persistence/persistence.client";
import { SummariesService } from "./summaries.service";

type TransactionsClient = RpcStubs<
  ReturnType<PersistenceClient["user"]>["transactions"]
>;

const expectedIncome = {
  amount: "1600000.00",
  estimatedAmount: "50000.00",
  unknownAmountCount: 1,
  paymentCount: 3,
};

function group(
  update: Partial<TaggedMovementAggregate>,
): TaggedMovementAggregate {
  return {
    ...movementAggregate(update),
    type: "debit",
    isInternalMovement: false,
    reviewStatus: "clear",
    hasReceipt: false,
    tag: null,
    amount: "-10.00",
    count: 1,
    ...update,
  };
}

function periodGroups(received: string, spending: string) {
  return [
    group({ type: "credit", hasReceipt: true, amount: received }),
    group({ amount: `-${spending}` }),
  ];
}

function setup() {
  const aggregates = vi.fn<TransactionsClient["aggregates"]["query"]>(
    async () => [],
  );
  const taggedAggregates = vi.fn<
    TransactionsClient["taggedAggregates"]["query"]
  >(async () => []);
  const getExpectedForUser = vi.fn<IncomeService["getExpectedForUser"]>(
    async (_userId, month = "2026-09") => ({
      month,
      currency: "CLP",
      totals: expectedIncome,
      payments: [],
    }),
  );
  const transactions = {
    aggregates: { query: aggregates },
    taggedAggregates: { query: taggedAggregates },
  } satisfies Pick<TransactionsClient, "aggregates" | "taggedAggregates">;
  const persistence = {
    user: vi.fn(() => ({
      transactions,
    })),
  };

  return {
    service: new SummariesService(
      persistence as unknown as PersistenceClient,
      { getExpectedForUser } as unknown as IncomeService,
    ),
    aggregates,
    taggedAggregates,
    getExpectedForUser,
  };
}

describe("SummariesService", () => {
  it("includes untagged spending in the total beyond the exclusive tag breakdown", async () => {
    const { service, taggedAggregates } = setup();
    const food = "00000000-0000-4000-8000-000000000031";
    const leisure = "00000000-0000-4000-8000-000000000032";
    taggedAggregates.mockResolvedValue([
      group({
        tag: { id: food, name: "Comida", color: null },
        amount: "-4000.00",
      }),
      group({
        tag: { id: leisure, name: "Ocio", color: null },
        amount: "-5000.00",
      }),
      group({ amount: "-1000.00" }),
      group({ type: "credit", hasReceipt: true, amount: "1550000.00" }),
      group({ type: "credit", amount: "100.00" }),
    ]);

    const summary = await service.getMonthlyForUser("owner", "2026-09");
    expect(summary).toMatchObject({
      month: "2026-09",
      receivedIncome: "1550000.00",
      expectedIncome,
      spending: "10000.00",
      unclassifiedCredits: { amount: "100.00", count: 1 },
      unresolvedMovementCount: 0,
    });
    expect(summary.tags).toEqual([
      {
        id: leisure,
        name: "Ocio",
        color: null,
        amount: "5000.00",
        grossAmount: "5000.00",
        refunds: "0.00",
        reimbursements: "0.00",
        count: 1,
      },
      {
        id: food,
        name: "Comida",
        color: null,
        amount: "4000.00",
        grossAmount: "4000.00",
        refunds: "0.00",
        reimbursements: "0.00",
        count: 1,
      },
    ]);
    expect(taggedAggregates).toHaveBeenCalledExactlyOnceWith({
      start: "2026-09-01 00:00:00",
      end: "2026-10-01 00:00:00",
      asOf: undefined,
      adjustmentsAsOf: expect.any(String),
    });
  });

  it("compares adjacent months without tag reads or floating point money math", async () => {
    const { service, aggregates, taggedAggregates } = setup();
    aggregates.mockImplementation(async ({ start }) =>
      start.startsWith("2026-01")
        ? periodGroups("100000.01", "1000.00")
        : periodGroups("100000.02", "1100.00"),
    );

    await expect(
      service.getComparisonForUser("owner", "2026-01"),
    ).resolves.toEqual({
      month: "2026-01",
      previousMonth: "2025-12",
      partial: false,
      receivedIncome: {
        current: "100000.01",
        previous: "100000.02",
        change: "-0.01",
      },
      spending: { current: "1000.00", previous: "1100.00", change: "-100.00" },
      unresolvedMovementCount: { current: 0, previous: 0 },
    });
    expect(taggedAggregates).not.toHaveBeenCalled();
    expect(aggregates).toHaveBeenCalledWith({
      start: "2025-12-01 00:00:00",
      end: "2026-01-01 00:00:00",
      adjustmentsAsOf: expect.any(String),
    });
  });

  it("cuts off the current month at now and compares the same Santiago day in the preceding month", async () => {
    const { service, aggregates, taggedAggregates, getExpectedForUser } =
      setup();
    const now = new Date("2026-10-16T15:30:45.000Z");
    aggregates.mockImplementation(async ({ start }) =>
      start.startsWith("2026-10")
        ? periodGroups("100.00", "50.00")
        : periodGroups("80.00", "75.00"),
    );
    taggedAggregates.mockResolvedValue(periodGroups("100.00", "50.00"));

    const summary = await service.getMonthlyForUser("owner", "2026-10", now);
    expect(summary.expectedIncome).toEqual(expectedIncome);
    expect(getExpectedForUser).toHaveBeenCalledWith("owner", "2026-10");
    expect(taggedAggregates).toHaveBeenCalledWith({
      start: "2026-10-01 00:00:00",
      end: "2026-11-01 00:00:00",
      asOf: now.toISOString(),
      adjustmentsAsOf: now.toISOString(),
    });

    const comparison = await service.getComparisonForUser(
      "owner",
      "2026-10",
      now,
    );
    expect(comparison).toMatchObject({
      partial: true,
      previousMonth: "2026-09",
    });
    expect(comparison.spending.change).toBe("-25.00");
    expect(comparison.receivedIncome.change).toBe("20.00");
    expect(aggregates).toHaveBeenCalledWith({
      start: "2026-09-01 00:00:00",
      end: "2026-09-16 12:30:45",
      adjustmentsAsOf: now.toISOString(),
    });
  });

  it("uses the entire preceding month if it has fewer days than the current date", async () => {
    const { service, aggregates } = setup();
    await service.getComparisonForUser(
      "owner",
      "2026-03",
      new Date("2026-03-31T15:00:00.000Z"),
    );
    expect(aggregates).toHaveBeenCalledWith({
      start: "2026-02-01 00:00:00",
      end: "2026-03-01 00:00:00",
      adjustmentsAsOf: expect.any(String),
    });
  });

  it("includes archived tags, preserves exact sort order and excludes internal or reviewed amounts", async () => {
    const { service, taggedAggregates } = setup();
    const archived = { id: "a", name: "Archived", color: null };
    const other = { id: "c", name: "Other", color: null };
    taggedAggregates.mockResolvedValue([
      group({ tag: archived, amount: "-9007199254740.99", count: 2 }),
      group({ tag: other, amount: "-9007199254740.98" }),
      group({
        tag: { id: "b", name: "Internal", color: null },
        isInternalMovement: true,
        amount: "-9999.00",
      }),
      group({ tag: other, reviewStatus: "needs_review", count: 3 }),
      group({ tag: other, isInternalMovement: null, count: 2 }),
    ]);

    const summary = await service.getMonthlyForUser("owner", "2026-09");
    expect(summary.tags).toEqual([
      {
        id: "a",
        name: "Archived",
        color: null,
        amount: "9007199254740.99",
        grossAmount: "9007199254740.99",
        refunds: "0.00",
        reimbursements: "0.00",
        count: 2,
      },
      {
        id: "c",
        name: "Other",
        color: null,
        amount: "9007199254740.98",
        grossAmount: "9007199254740.98",
        refunds: "0.00",
        reimbursements: "0.00",
        count: 1,
      },
    ]);
    expect(summary.unresolvedMovementCount).toBe(5);
  });
});
