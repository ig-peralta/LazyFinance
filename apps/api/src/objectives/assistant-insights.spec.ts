import type { BudgetPeriodRecord } from "@lazyfinance/contracts/internal";
import { describe, expect, it, vi } from "vitest";
import type { PersistenceClient } from "../persistence/persistence.client";
import { ObjectivesService } from "./objectives.service";
import { SavingsGoalsService } from "./savings-goals.service";
import { SavingsProgressService } from "./savings-progress.service";

const owner = "owned";
const now = new Date("2026-11-22T16:00:00.000Z");
const tag = {
  id: "00000000-0000-4000-8000-000000000031",
  name: "Comida",
  color: null,
};
const secondTag = {
  id: "00000000-0000-4000-8000-000000000032",
  name: "Transporte",
  color: null,
};
const budget = (
  id: string,
  tags = [tag],
  period: BudgetPeriodRecord["period"] = "monthly",
): BudgetPeriodRecord => ({
  id,
  revisionId: id,
  name: id,
  amount: "100.00",
  kind: "time_based",
  intent: "spending",
  period,
  isRecurring: true,
  startDate: "2026-11-01 00:00:00",
  endDate: null,
  archivedAt: null,
  tags,
});

describe("assistant budget and goal window semantics", () => {
  it("calculates the compatible total across all budgets, not only the twelve preview rows", async () => {
    const uuid = (value: number) =>
      `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
    const definitions = Array.from({ length: 13 }, (_, index) =>
      budget(uuid(index + 1), [{ ...tag, id: uuid(index + 100) }]),
    );
    const persistence = {
      user: vi.fn(() => ({
        objectives: { forPeriod: { query: vi.fn(async () => definitions) } },
      })),
    };
    const service = new ObjectivesService(
      persistence as unknown as PersistenceClient,
    );
    const result = await service.monthlyPlan(owner, "2026-12", now);
    expect(result).toMatchObject({
      total: "1300.00",
      totalReason: "comparable",
      budgetCount: 13,
      hasMore: true,
    });
    expect(result.budgets).toHaveLength(12);
  });

  it("sums compatible future monthly limits but refuses overlaps and mixed periods", async () => {
    const definitions = [
      budget("00000000-0000-4000-8000-000000000001"),
      budget("00000000-0000-4000-8000-000000000002", [secondTag]),
    ];
    const forPeriod = vi.fn(async () => definitions);
    const persistence = {
      user: vi.fn(() => ({ objectives: { forPeriod: { query: forPeriod } } })),
    };
    const service = new ObjectivesService(
      persistence as unknown as PersistenceClient,
    );
    await expect(
      service.monthlyPlan(owner, "2026-12", now),
    ).resolves.toMatchObject({
      total: "200.00",
      totalReason: "comparable",
      budgets: [{ spent: null }, { spent: null }],
    });
    expect(forPeriod).toHaveBeenCalledWith({ before: "2027-01-01 00:00:00" });
    definitions[1] = budget(definitions[1].id, [tag]);
    await expect(
      service.monthlyPlan(owner, "2026-12", now),
    ).resolves.toMatchObject({ total: null, totalReason: "overlapping_tags" });
    definitions[1] = budget(definitions[1].id, [secondTag], "yearly");
    await expect(
      service.monthlyPlan(owner, "2026-12", now),
    ).resolves.toMatchObject({ total: null, totalReason: "mixed_periods" });
    definitions[1] = {
      ...budget(definitions[1].id, [secondTag]),
      startDate: "2026-12-10 00:00:00",
    };
    await expect(
      service.monthlyPlan(owner, "2026-12", now),
    ).resolves.toMatchObject({ total: null, totalReason: "different_windows" });
    definitions[0] = {
      ...budget(definitions[0].id),
      archivedAt: "2026-12-22T12:00:00.000Z",
    };
    definitions[1] = budget(definitions[1].id, [secondTag]);
    await expect(
      service.monthlyPlan(owner, "2026-12", now),
    ).resolves.toMatchObject({ total: null, totalReason: "partial_month" });
  });

  it("does not total an apparently full-month budget if its effective revision began mid-month", async () => {
    const definition = budget("00000000-0000-4000-8000-000000000003");
    const spending = vi.fn(async () => [
      {
        id: definition.id,
        revisionId: definition.revisionId,
        amount: "-10.00",
        count: 1,
        refundAmount: "0.00",
        reimbursementAmount: "0.00",
        adjustmentReviewCount: 0,
        start: "2026-11-10T03:00:00.000Z",
        end: "2026-12-01T03:00:00.000Z",
        archivedAt: null,
      },
    ]);
    const persistence = {
      user: vi.fn(() => ({
        objectives: {
          forPeriod: { query: vi.fn(async () => [definition]) },
          spending: { query: spending },
        },
      })),
    };
    const service = new ObjectivesService(
      persistence as unknown as PersistenceClient,
    );
    await expect(
      service.monthlyPlan(owner, "2026-11", now),
    ).resolves.toMatchObject({
      budgetCount: 1,
      total: null,
      totalReason: "changed_definitions",
      budgets: [{ spent: "10.00" }],
    });
    expect(spending).toHaveBeenCalledOnce();
  });

  it("measures a single lifetime goal within just the requested month instead of all history", async () => {
    const goal = {
      id: "00000000-0000-4000-8000-000000000041",
      revisionId: "00000000-0000-4000-8000-000000000042",
      name: "Fondo",
      amount: "100.00",
      intent: "saving" as const,
      kind: "amount_based" as const,
      isRecurring: null,
      period: null,
      startDate: null,
      endDate: null,
      archivedAt: null,
      version: 1,
      tags: [tag],
    };
    const savingsFacts = vi.fn(async () => ({
      groups: [
        {
          accountType: "savings" as const,
          type: "credit" as const,
          reviewStatus: "clear" as const,
          amount: "15.00",
          count: 1,
        },
        {
          accountType: "savings" as const,
          type: "debit" as const,
          reviewStatus: "clear" as const,
          amount: "-5.00",
          count: 1,
        },
        {
          accountType: "savings" as const,
          type: "credit" as const,
          reviewStatus: "needs_review" as const,
          amount: "20.00",
          count: 1,
        },
      ],
      tracking: {
        start: "2026-09-01T04:00:00.000Z",
        end: "2026-10-01T03:00:00.000Z",
        asOf: now.toISOString(),
        archivedAt: null,
        empty: false,
      },
      historyCoverage: [
        {
          accountId: "00000000-0000-4000-8000-000000000051",
          completeness: "partial" as const,
          from: null,
          through: null,
        },
      ],
    }));
    const persistence = {
      user: vi.fn(() => ({
        objectives: { savingsFacts: { query: savingsFacts } },
      })),
    };
    const goals = { detail: vi.fn(async () => goal) };
    const service = new SavingsProgressService(
      persistence as unknown as PersistenceClient,
      goals as unknown as SavingsGoalsService,
    );
    const result = await service.monthly(owner, {
      id: goal.id,
      month: "2026-09",
      asOf: now.toISOString(),
    });
    expect(savingsFacts).toHaveBeenCalledExactlyOnceWith({
      id: goal.id,
      expectedVersion: 1,
      start: "2026-09-01 00:00:00",
      end: "2026-10-01 00:00:00",
      asOf: now.toISOString(),
    });
    expect(result).toMatchObject({
      contributions: "15.00",
      withdrawals: "5.00",
      netContributions: "10.00",
      pendingCount: 1,
      incompleteCoverage: true,
    });
  });
});
