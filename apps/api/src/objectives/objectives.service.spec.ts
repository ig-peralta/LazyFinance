import type { ObjectiveSummary, TagSummary } from "@lazyfinance/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PersistenceClient } from "../persistence/persistence.client";
import { ObjectivesService } from "./objectives.service";

const userId = "00000000-0000-4000-8000-000000000001";
const budgetId = "00000000-0000-4000-8000-000000000041";
const goalId = "00000000-0000-4000-8000-000000000042";

function setup(
  objectives: Omit<ObjectiveSummary, "tags">[] = [],
  links: (TagSummary & { objectiveId: string })[] = [],
) {
  const list = vi.fn(async () => objectives);
  const tags = vi.fn(async () => links);
  const taggedDebits = vi.fn(
    async (): Promise<
      {
        id: string;
        amount: string;
        bookedAt: string;
        tagId: string;
      }[]
    > => [],
  );
  const persistence = {
    user: vi.fn(() => ({
      objectives: { list: { query: list }, tags: { query: tags } },
      transactions: { taggedDebits: { query: taggedDebits } },
    })),
  };

  return {
    service: new ObjectivesService(persistence as unknown as PersistenceClient),
    tags,
    taggedDebits,
  };
}

describe("ObjectivesService", () => {
  it("assembles budgets and savings targets with independent tag lists without date round trips", async () => {
    const objectives: Omit<ObjectiveSummary, "tags">[] = [
      {
        id: budgetId,
        name: "Viaje",
        amount: "240000.00",
        kind: "time_based",
        intent: "spending",
        isRecurring: false,
        period: null,
        startDate: "2025-09-01T15:00:00.000Z",
        endDate: "2025-10-01T15:00:00.000Z",
      },
      {
        id: goalId,
        name: "Fondo",
        amount: "6500000.00",
        kind: "amount_based",
        intent: "saving",
        isRecurring: null,
        period: null,
        startDate: null,
        endDate: null,
      },
    ];
    const links = [
      { objectiveId: budgetId, id: "family", name: "Familia", color: null },
      {
        objectiveId: budgetId,
        id: "travel",
        name: "Vacaciones",
        color: "#0D9488",
      },
    ];
    const { service, tags } = setup(objectives, links);

    await expect(service.getForUser(userId)).resolves.toEqual([
      {
        ...objectives[0],
        tags: links.map(({ objectiveId: _, ...tag }) => tag),
      },
      { ...objectives[1], tags: [] },
    ]);
    expect(tags).toHaveBeenCalledWith({ ids: [budgetId, goalId] });
  });

  it("does not read tags or movements if there are no objectives", async () => {
    const { service, tags, taggedDebits } = setup();
    await expect(service.getForUser(userId)).resolves.toEqual([]);
    await expect(
      service.getSpendingProgressForUser(userId, "2026-09"),
    ).resolves.toEqual([]);
    expect(tags).not.toHaveBeenCalled();
    expect(taggedDebits).not.toHaveBeenCalled();
  });

  it("counts each matching movement once per budget and separates monthly from yearly spend", async () => {
    const groceriesTag = "groceries";
    const familyTag = "family";
    const vacationTag = "vacation";
    const vacationId = "00000000-0000-4000-8000-000000000052";
    const { service, taggedDebits } = setup(
      [
        {
          id: budgetId,
          name: "Supermercado",
          amount: "280000.00",
          kind: "time_based",
          intent: "spending",
          isRecurring: true,
          period: "monthly",
          startDate: "2024-01-01T15:00:00Z",
          endDate: null,
        },
        {
          id: vacationId,
          name: "Vacaciones",
          amount: "650000.00",
          kind: "time_based",
          intent: "spending",
          isRecurring: true,
          period: "yearly",
          startDate: "2024-01-01T15:00:00Z",
          endDate: null,
        },
        {
          id: goalId,
          name: "Fondo",
          amount: "6500000.00",
          kind: "amount_based",
          intent: "saving",
          isRecurring: null,
          period: null,
          startDate: null,
          endDate: null,
        },
      ],
      [
        {
          objectiveId: budgetId,
          id: groceriesTag,
          name: "Supermercado",
          color: null,
        },
        { objectiveId: budgetId, id: familyTag, name: "Familia", color: null },
        {
          objectiveId: vacationId,
          id: vacationTag,
          name: "Vacaciones",
          color: null,
        },
      ],
    );
    taggedDebits.mockResolvedValue([
      {
        id: "one",
        amount: "-250000.00",
        bookedAt: "2026-09-15T15:00:00Z",
        tagId: groceriesTag,
      },
      {
        id: "two",
        amount: "-50000.00",
        bookedAt: "2026-09-15T15:00:00Z",
        tagId: familyTag,
      },
      {
        id: "three",
        amount: "-200000.00",
        bookedAt: "2026-01-14T15:00:00Z",
        tagId: vacationTag,
      },
      {
        id: "four",
        amount: "-150000.00",
        bookedAt: "2026-09-17T15:00:00Z",
        tagId: vacationTag,
      },
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
        id: vacationId,
        name: "Vacaciones",
        month: "2026-09",
        period: "yearly",
        limit: "650000.00",
        spent: "350000.00",
        remaining: "300000.00",
        percentage: 53,
      },
    ]);
    expect(taggedDebits).toHaveBeenCalledWith({
      start: "2026-01-01 00:00:00",
      end: "2026-10-01 00:00:00",
      asOf: undefined,
    });
  });

  it("limits the current month's budget query to now", async () => {
    const now = new Date("2026-10-16T15:00:00.000Z");
    const { service, taggedDebits } = setup(
      [
        {
          id: budgetId,
          name: "Supermercado",
          amount: "280000.00",
          kind: "time_based",
          intent: "spending",
          isRecurring: true,
          period: "monthly",
          startDate: "2024-01-01T15:00:00.000Z",
          endDate: null,
        },
      ],
      [
        {
          objectiveId: budgetId,
          id: "groceries",
          name: "Supermercado",
          color: null,
        },
      ],
    );

    await service.getSpendingProgressForUser(userId, "2026-10", now);
    expect(taggedDebits).toHaveBeenCalledWith({
      start: "2026-10-01 00:00:00",
      end: "2026-11-01 00:00:00",
      asOf: now.toISOString(),
    });
  });
});
