import type { ObjectiveSummary } from "@lazyfinance/contracts";
import type { ObjectiveSpendingInput } from "@lazyfinance/contracts/internal";
import { describe, expect, it, vi } from "vitest";
import type { PersistenceClient } from "../persistence/persistence.client";
import { ObjectivesService } from "./objectives.service";

const userId = "00000000-0000-4000-8000-000000000001";
const budgetId = "00000000-0000-4000-8000-000000000041";

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
  const spending = vi.fn(
    async (
      _input: ObjectiveSpendingInput,
    ): Promise<
      {
        id: string;
        amount: string;
        count: number;
      }[]
    > => [],
  );
  const persistence = {
    user: () => ({
      objectives: {
        list: { query: async () => objectives },
        spending: { query: spending },
      },
    }),
  };
  return {
    service: new ObjectivesService(persistence as unknown as PersistenceClient),
    spending,
  };
}

describe("ObjectivesService spending progress", () => {
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
      { id: budgetId, amount: "-300000.00", count: 2 },
      { id: yearlyId, amount: "-350000.00", count: 2 },
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
        remaining: "-20000.00",
        percentage: 107,
      },
      {
        id: yearlyId,
        name: "Vacaciones",
        month: "2026-09",
        period: "yearly",
        limit: "650000.00",
        spent: "350000.00",
        remaining: "300000.00",
        percentage: 53,
      },
    ]);
    expect(spending).toHaveBeenCalledWith({
      windows: [
        {
          id: budgetId,
          start: "2026-09-01 00:00:00",
          end: "2026-10-01 00:00:00",
        },
        {
          id: yearlyId,
          start: "2026-01-01 00:00:00",
          end: "2026-10-01 00:00:00",
        },
      ],
      asOf: undefined,
    });
  });

  it("distinguishes zero spending from an objective removed between reads", async () => {
    const { service, spending } = setup([budget()]);
    spending.mockResolvedValue([{ id: budgetId, amount: "0", count: 0 }]);
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
    spending.mockResolvedValue([
      { id: budgetId, amount: "-90071992547409.98", count: 2 },
    ]);
    await expect(
      service.getSpendingProgressForUser(userId, "2026-09"),
    ).resolves.toMatchObject([
      {
        spent: "90071992547409.98",
        remaining: "-81064793292668.99",
        percentage: 999,
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
          start: "2026-10-01 00:00:00",
          end: "2026-11-01 00:00:00",
        },
      ],
      asOf: now.toISOString(),
    });
  });
});
