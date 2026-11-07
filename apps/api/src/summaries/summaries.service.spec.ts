import type { TagSummary } from "@lazyfinance/contracts";
import type {
  MovementAggregate,
  PeriodInput,
} from "@lazyfinance/contracts/internal";
import { describe, expect, it, vi } from "vitest";
import type { IncomeService } from "../income/income.service";
import type { PersistenceClient } from "../persistence/persistence.client";
import { SummariesService } from "./summaries.service";

const expectedIncome = {
  amount: "1600000.00",
  estimatedAmount: "50000.00",
  unknownAmountCount: 1,
  paymentCount: 3,
};

function group(update: Partial<MovementAggregate>): MovementAggregate {
  return {
    type: "debit",
    isInternalMovement: false,
    reviewStatus: "clear",
    hasReceipt: false,
    tagId: null,
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
  const aggregates = vi.fn(
    async (_period: PeriodInput): Promise<MovementAggregate[]> => [],
  );
  const tags = vi.fn(
    async (): Promise<(TagSummary & { isArchived: boolean })[]> => [],
  );
  const getExpectedForUser = vi.fn(async () => ({ totals: expectedIncome }));
  const persistence = {
    user: vi.fn(() => ({
      transactions: { aggregates: { query: aggregates } },
      tags: { list: { query: tags } },
    })),
  };

  return {
    service: new SummariesService(
      persistence as unknown as PersistenceClient,
      { getExpectedForUser } as unknown as IncomeService,
    ),
    aggregates,
    tags,
    getExpectedForUser,
  };
}

describe("SummariesService", () => {
  it("includes untagged spending in the total beyond the exclusive tag breakdown", async () => {
    const { service, aggregates, tags } = setup();
    const food = "00000000-0000-4000-8000-000000000031";
    const leisure = "00000000-0000-4000-8000-000000000032";
    aggregates.mockResolvedValue([
      group({ tagId: food, amount: "-4000.00" }),
      group({ tagId: leisure, amount: "-5000.00" }),
      group({ amount: "-1000.00" }),
      group({ type: "credit", hasReceipt: true, amount: "1550000.00" }),
      group({ type: "credit", amount: "100.00" }),
    ]);
    tags.mockResolvedValue([
      { id: food, name: "Comida", color: null, isArchived: false },
      { id: leisure, name: "Ocio", color: null, isArchived: false },
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
      { id: leisure, name: "Ocio", color: null, amount: "5000.00", count: 1 },
      { id: food, name: "Comida", color: null, amount: "4000.00", count: 1 },
    ]);
    expect(aggregates).toHaveBeenCalledExactlyOnceWith({
      start: "2026-09-01 00:00:00",
      end: "2026-10-01 00:00:00",
      asOf: undefined,
    });
  });

  it("compares adjacent months without tag reads or floating point money math", async () => {
    const { service, aggregates, tags } = setup();
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
    expect(tags).not.toHaveBeenCalled();
    expect(aggregates).toHaveBeenCalledWith({
      start: "2025-12-01 00:00:00",
      end: "2026-01-01 00:00:00",
    });
  });

  it("cuts off the current month at now and compares the same Santiago day in the preceding month", async () => {
    const { service, aggregates, getExpectedForUser } = setup();
    const now = new Date("2026-10-16T15:30:45.000Z");
    aggregates.mockImplementation(async ({ start }) =>
      start.startsWith("2026-10")
        ? periodGroups("100.00", "50.00")
        : periodGroups("80.00", "75.00"),
    );

    const summary = await service.getMonthlyForUser("owner", "2026-10", now);
    expect(summary.expectedIncome).toEqual(expectedIncome);
    expect(getExpectedForUser).toHaveBeenCalledWith("owner", "2026-10");
    expect(aggregates).toHaveBeenCalledWith({
      start: "2026-10-01 00:00:00",
      end: "2026-11-01 00:00:00",
      asOf: now.toISOString(),
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
    });
  });

  it("includes archived tags, preserves exact sort order and excludes internal or reviewed amounts", async () => {
    const { service, aggregates, tags } = setup();
    tags.mockResolvedValue([
      { id: "a", name: "Archived", color: null, isArchived: true },
      { id: "b", name: "Internal", color: null, isArchived: false },
      { id: "c", name: "Other", color: null, isArchived: false },
    ]);
    aggregates.mockResolvedValue([
      group({ tagId: "a", amount: "-9007199254740.99", count: 2 }),
      group({ tagId: "c", amount: "-9007199254740.98" }),
      group({ tagId: "b", isInternalMovement: true, amount: "-9999.00" }),
      group({ tagId: "c", reviewStatus: "needs_review", count: 3 }),
      group({ tagId: "c", isInternalMovement: null, count: 2 }),
    ]);

    const summary = await service.getMonthlyForUser("owner", "2026-09");
    expect(summary.tags).toEqual([
      {
        id: "a",
        name: "Archived",
        color: null,
        amount: "9007199254740.99",
        count: 2,
      },
      {
        id: "c",
        name: "Other",
        color: null,
        amount: "9007199254740.98",
        count: 1,
      },
    ]);
    expect(summary.unresolvedMovementCount).toBe(5);
  });
});
