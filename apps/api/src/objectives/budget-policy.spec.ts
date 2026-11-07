import {
  type BudgetRevision,
  BudgetVersionInputSchema,
  CreateBudgetInputSchema,
  UpdateBudgetInputSchema,
} from "@lazyfinance/contracts";
import { describe, expect, it } from "vitest";
import { budgetPeriod } from "./budget-period";
import {
  budgetLocalTime,
  budgetSchedule,
  nextBudgetRevision,
} from "./budget-policy";

const now = new Date("2026-11-15T15:00:00Z");
const tagId = "00000000-0000-4000-8000-000000000031";
const base = {
  name: "Groceries",
  amount: "280000.00",
  tagIds: [tagId],
  schedule: { period: "monthly", startDate: "2026-11-01" },
};

function revision(update: Partial<BudgetRevision> = {}): BudgetRevision {
  return {
    id: "00000000-0000-4000-8000-000000000041",
    budgetId: "00000000-0000-4000-8000-000000000042",
    version: 1,
    name: "Groceries",
    amount: "280000.00",
    kind: "time_based",
    isRecurring: true,
    period: "monthly",
    startDate: "2026-11-01T03:00:00.000000Z",
    endDate: null,
    effectiveFrom: "2026-11-01T03:00:00.000000Z",
    recordedAt: "2026-11-01T03:00:00.000000Z",
    supersededAt: null,
    tags: [{ id: tagId, name: "Groceries", color: null }],
    ...update,
  };
}

describe("budget management inputs", () => {
  it("accepts only explicit supported schedules, positive exact amounts and unique tags", () => {
    expect(
      CreateBudgetInputSchema.parse({ ...base, name: " Groceries " }).name,
    ).toBe("Groceries");
    for (const update of [
      { name: " " },
      { amount: "0" },
      { amount: "-1" },
      { amount: "01" },
      { amount: "1.001" },
      { amount: 10 },
      { tagIds: [] },
      { tagIds: [tagId, tagId] },
      { userId: tagId },
      { schedule: { period: "weekly", startDate: "2026-11-01" } },
      { schedule: { period: "monthly", startDate: "2026-11-02" } },
      { schedule: { period: "yearly", startDate: "2026-11-01" } },
      {
        schedule: {
          period: "fixed",
          startDate: "2026-02-30",
          endDate: "2026-03-01",
        },
      },
      {
        schedule: {
          period: "fixed",
          startDate: "2026-11-02",
          endDate: "2026-11-01",
        },
      },
    ])
      expect(
        CreateBudgetInputSchema.safeParse({ ...base, ...update }).success,
      ).toBe(false);
  });

  it("requires an edit version and does not accept caller-supplied effective dates", () => {
    const { schedule: _, ...budget } = base;
    const input = { id: tagId, expectedVersion: 1, budget };
    expect(UpdateBudgetInputSchema.safeParse(input).success).toBe(true);
    expect(
      UpdateBudgetInputSchema.safeParse({ ...input, expectedVersion: 0 })
        .success,
    ).toBe(false);
    expect(
      UpdateBudgetInputSchema.safeParse({
        ...input,
        effectiveFrom: "2026-01-01",
      }).success,
    ).toBe(false);
    expect(
      BudgetVersionInputSchema.safeParse({
        id: tagId,
        expectedVersion: 1,
        at: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
  });
});

describe("budget calendar policy", () => {
  it("keeps calendar boundaries local and converts an inclusive fixed last day to an exclusive end", () => {
    expect(
      budgetSchedule(
        { period: "fixed", startDate: "2026-09-05", endDate: "2026-09-06" },
        now,
      ),
    ).toEqual({
      isRecurring: false,
      period: null,
      startDate: "2026-09-05 00:00:00",
      endDate: "2026-09-07 00:00:00",
    });
    expect(
      budgetSchedule(
        { period: "fixed", startDate: "2028-02-28", endDate: "2028-02-29" },
        now,
      ).endDate,
    ).toBe("2028-03-01 00:00:00");
    expect(() =>
      budgetSchedule({ period: "monthly", startDate: "2026-10-01" }, now),
    ).toThrow("current or a future period");
  });

  it("schedules recurring financial changes at the next natural boundary", () => {
    expect(nextBudgetRevision(revision(), now)).toBe("2026-12-01 00:00:00");
    expect(nextBudgetRevision(revision({ period: "yearly" }), now)).toBe(
      "2027-01-01 00:00:00",
    );
    expect(
      nextBudgetRevision(revision(), new Date("2027-01-01T02:59:59Z")),
    ).toBe("2027-01-01 00:00:00");
    expect(
      nextBudgetRevision(revision(), new Date("2027-01-01T03:00:00Z")),
    ).toBe("2027-02-01 00:00:00");
  });

  it("rejects started fixed, unsupported and ended configurations", () => {
    for (const update of [
      { isRecurring: false, period: null },
      { period: "weekly" },
      { endDate: "2026-12-01T03:00:00Z" },
    ] satisfies Partial<BudgetRevision>[])
      expect(() => nextBudgetRevision(revision(update), now)).toThrow();
  });

  it("preserves exact legacy bounds, including a fractional end inside a month", () => {
    const endDate = "2026-11-01T03:00:00.123456Z";
    const definition = {
      ...revision({
        isRecurring: false,
        period: null,
        startDate: "2026-10-01T03:00:00.123456Z",
        endDate,
      }),
      intent: "spending" as const,
    };
    expect(budgetPeriod(definition, "2026-11")).toEqual({
      start: definition.startDate,
      end: definition.endDate,
      period: "fixed",
    });
    expect(budgetLocalTime(endDate)).toBe("2026-11-01 00:00:00.123456");
  });

  it("does not reverse a legacy fixed window inside Santiago's repeated DST hour", () => {
    const definition = {
      ...revision({
        isRecurring: false,
        period: null,
        startDate: "2026-04-05T02:50:00.000000Z",
        endDate: "2026-04-05T03:10:00.000000Z",
      }),
      intent: "spending" as const,
    };
    expect(budgetPeriod(definition, "2026-04")).toEqual({
      start: definition.startDate,
      end: definition.endDate,
      period: "fixed",
    });
  });
});
