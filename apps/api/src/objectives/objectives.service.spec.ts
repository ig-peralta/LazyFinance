import type { ObjectiveSummary } from "@lazyfinance/contracts";
import type { BudgetPeriodRecord } from "@lazyfinance/contracts/internal";
import { describe, expect, it, vi } from "vitest";
import type { RpcStubs } from "../../tests/fixtures/rpc-stubs";
import type { PersistenceClient } from "../persistence/persistence.client";
import { ObjectivesService } from "./objectives.service";

const userId = "00000000-0000-4000-8000-000000000001";
const budgetId = "00000000-0000-4000-8000-000000000041";

type ObjectivesClient = RpcStubs<
  ReturnType<PersistenceClient["user"]>["objectives"]
>;

function budget(update: Partial<ObjectiveSummary> = {}): ObjectiveSummary {
  return {
    id: budgetId,
    name: "Supermercado",
    amount: "280000.00",
    kind: "time_based",
    intent: "spending",
    isRecurring: true,
    period: "monthly",
    startDate: "2024-01-01T15:00:00.000Z",
    endDate: null,
    tags: [{ id: "groceries", name: "Supermercado", color: null }],
    ...update,
  };
}

function setup(objectives: ObjectiveSummary[] = []) {
  const spending = vi.fn<ObjectivesClient["spending"]["query"]>(async () => []);
  const forPeriod = vi.fn<ObjectivesClient["forPeriod"]["query"]>(async () =>
    objectives.map(
      (objective): BudgetPeriodRecord => ({
        ...objective,
        revisionId: objective.id,
        archivedAt: null,
      }),
    ),
  );
  const reads = {
    list: { query: async () => objectives },
    forPeriod: { query: forPeriod },
    spending: { query: spending },
  } satisfies Pick<ObjectivesClient, "list" | "forPeriod" | "spending">;
  const persistence = {
    user: () => ({
      objectives: reads,
    }),
  };
  return {
    service: new ObjectivesService(persistence as unknown as PersistenceClient),
    spending,
    forPeriod,
  };
}

function fact(id: string, amount: string, count: number) {
  return {
    id,
    revisionId: id,
    amount,
    count,
    refundAmount: "0.00",
    reimbursementAmount: "0.00",
    adjustmentReviewCount: 0,
    start: "2026-09-01T04:00:00.000000Z",
    end: "2026-10-01T03:00:00.000000Z",
    archivedAt: null,
  };
}

const tracking = {
  start: "2026-09-01T04:00:00.000000Z",
  end: "2026-10-01T03:00:00.000000Z",
  archivedAt: null,
};

describe("ObjectivesService spending progress", () => {
  it("pins the financial configuration and rejects mismatched aggregate revisions", async () => {
    const { service, spending, forPeriod } = setup([budget()]);
    spending.mockResolvedValue([
      {
        ...fact(budgetId, "-100", 1),
        revisionId: "00000000-0000-4000-8000-000000000099",
      },
    ]);
    await expect(
      service.getSpendingProgressForUser(userId, "2026-09"),
    ).resolves.toEqual([]);
    expect(forPeriod).toHaveBeenCalledExactlyOnceWith({
      before: "2026-10-01 00:00:00",
    });
  });

  it("retains archived historical totals without prorating and omits later periods", async () => {
    const { service, spending, forPeriod } = setup();
    const archivedAt = "2026-09-15T15:00:00.000000Z";
    forPeriod.mockResolvedValue([
      { ...budget(), revisionId: budgetId, archivedAt },
    ]);
    spending.mockResolvedValue([
      { ...fact(budgetId, "-23000", 2), end: archivedAt, archivedAt },
    ]);
    await expect(
      service.getSpendingProgressForUser(userId, "2026-09"),
    ).resolves.toMatchObject([
      {
        limit: "280000.00",
        spent: "23000.00",
        remaining: "257000.00",
        tracking: { end: archivedAt, archivedAt },
      },
    ]);
    spending.mockClear();
    await expect(
      service.getSpendingProgressForUser(userId, "2026-10"),
    ).resolves.toEqual([]);
    expect(spending).not.toHaveBeenCalled();
  });

  it("does not fabricate future-period progress", async () => {
    const { service, spending, forPeriod } = setup([budget()]);
    await expect(
      service.getSpendingProgressForUser(
        userId,
        "2026-12",
        new Date("2026-11-15T15:00:00Z"),
      ),
    ).resolves.toEqual([]);
    expect(forPeriod).not.toHaveBeenCalled();
    expect(spending).not.toHaveBeenCalled();
  });

  it("includes an activation exactly at the observation cutoff but not a future activation", async () => {
    const now = new Date("2026-09-15T15:00:00.000Z");
    for (const offset of [0, 1]) {
      const { service, spending } = setup([
        budget({
          isRecurring: false,
          period: null,
          startDate: new Date(now.getTime() + offset).toISOString(),
          endDate: "2026-09-20T15:00:00Z",
        }),
      ]);
      await service.getSpendingProgressForUser(userId, "2026-09", now);
      expect(spending).toHaveBeenCalledTimes(offset === 0 ? 1 : 0);
    }
  });

  it("does not aggregate empty, saving, unsupported or untagged budgets", async () => {
    for (const objectives of [
      [],
      [budget({ intent: "saving" })],
      [budget({ tags: [] })],
      [budget({ period: "weekly" })],
      [budget({ isRecurring: false, endDate: "2025-01-01T15:00:00Z" })],
    ]) {
      const { service, spending } = setup(objectives);
      await expect(
        service.getSpendingProgressForUser(userId, "2026-09"),
      ).resolves.toEqual([]);
      expect(spending).not.toHaveBeenCalled();
    }
  });

  it("interprets signed aggregate facts using independent monthly and yearly windows", async () => {
    const yearlyId = "00000000-0000-4000-8000-000000000052";
    const { service, spending } = setup([
      budget(),
      budget({
        id: yearlyId,
        name: "Vacaciones",
        period: "yearly",
        amount: "650000.00",
      }),
    ]);
    spending.mockResolvedValue([
      fact(budgetId, "-300000.00", 2),
      fact(yearlyId, "-350000.00", 2),
    ]);

    await expect(
      service.getSpendingProgressForUser(userId, "2026-09"),
    ).resolves.toEqual([
      {
        id: budgetId,
        name: "Supermercado",
        month: "2026-09",
        period: "monthly",
        limit: "280000.00",
        spent: "300000.00",
        grossSpent: "300000.00",
        refunds: "0.00",
        reimbursements: "0.00",
        unresolvedAdjustmentCount: 0,
        adjustmentsAsOf: expect.any(String),
        remaining: "-20000.00",
        percentage: 107,
        revisionId: budgetId,
        tracking,
      },
      {
        id: yearlyId,
        name: "Vacaciones",
        month: "2026-09",
        period: "yearly",
        limit: "650000.00",
        spent: "350000.00",
        grossSpent: "350000.00",
        refunds: "0.00",
        reimbursements: "0.00",
        unresolvedAdjustmentCount: 0,
        adjustmentsAsOf: expect.any(String),
        remaining: "300000.00",
        percentage: 53,
        revisionId: yearlyId,
        tracking,
      },
    ]);
    expect(spending).toHaveBeenCalledWith({
      windows: [
        {
          id: budgetId,
          revisionId: budgetId,
          start: "2026-09-01 00:00:00",
          end: "2026-10-01 00:00:00",
        },
        {
          id: yearlyId,
          revisionId: yearlyId,
          start: "2026-01-01 00:00:00",
          end: "2026-10-01 00:00:00",
        },
      ],
      asOf: undefined,
      adjustmentsAsOf: expect.any(String),
    });
  });

  it("distinguishes zero spending from an objective removed between reads", async () => {
    const { service, spending } = setup([budget()]);
    spending.mockResolvedValue([fact(budgetId, "0", 0)]);
    await expect(
      service.getSpendingProgressForUser(userId, "2026-09"),
    ).resolves.toMatchObject([
      { spent: "0.00", remaining: "280000.00", percentage: 0 },
    ]);
    spending.mockResolvedValue([]);
    await expect(
      service.getSpendingProgressForUser(userId, "2026-09"),
    ).resolves.toEqual([]);
  });

  it("keeps exact cents when aggregate amounts exceed safe integer cents", async () => {
    const { service, spending } = setup([
      budget({ amount: "9007199254740.99" }),
    ]);
    spending.mockResolvedValue([fact(budgetId, "-90071992547409.98", 2)]);
    await expect(
      service.getSpendingProgressForUser(userId, "2026-09"),
    ).resolves.toMatchObject([
      {
        spent: "90071992547409.98",
        remaining: "-81064793292668.99",
        // The exact total is slightly above ten times the limit: floor = 1000%.
        percentage: 1000,
      },
    ]);
  });

  it("caps current-month factual reads at now without shortening the budget period", async () => {
    const now = new Date("2026-10-16T15:00:00.000Z");
    const { service, spending } = setup([budget()]);
    await service.getSpendingProgressForUser(userId, "2026-10", now);
    expect(spending).toHaveBeenCalledWith({
      windows: [
        {
          id: budgetId,
          revisionId: budgetId,
          start: "2026-10-01 00:00:00",
          end: "2026-11-01 00:00:00",
        },
      ],
      asOf: now.toISOString(),
      adjustmentsAsOf: now.toISOString(),
    });
  });
});
