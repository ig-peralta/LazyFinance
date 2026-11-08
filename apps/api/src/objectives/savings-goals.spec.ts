import {
  CreateSavingsGoalSchema,
  UpdateSavingsGoalSchema,
} from "@lazyfinance/contracts";
import { describe, expect, it } from "vitest";
import { savingsDefinition } from "./savings-goals.service";

const input = {
  name: "Emergency",
  amount: "100.1",
  tagIds: ["00000000-0000-4000-8000-000000000031"],
  schedule: { period: "lifetime" },
};

describe("savings goal management preparation", () => {
  it("supports lifetime, explicit calendar and inclusive fixed schedules without fabricating contributions", () => {
    expect(
      savingsDefinition(CreateSavingsGoalSchema.parse(input)),
    ).toMatchObject({
      amount: "100.10",
      kind: "amount_based",
      startDate: null,
      endDate: null,
      period: null,
    });
    expect(
      savingsDefinition(
        CreateSavingsGoalSchema.parse({
          ...input,
          schedule: {
            period: "fixed",
            startDate: "2026-02-01",
            endDate: "2026-02-28",
          },
        }),
      ),
    ).toMatchObject({
      startDate: "2026-02-01 00:00:00",
      endDate: "2026-03-01 00:00:00",
      isRecurring: false,
    });
    expect(
      savingsDefinition(
        CreateSavingsGoalSchema.parse({
          ...input,
          schedule: { period: "monthly", startDate: "2024-01-01" },
        }),
      ),
    ).toMatchObject({ period: "monthly", startDate: "2024-01-01 00:00:00" });
  });

  it("rejects invalid money, repeated tags, unsupported periods, dates and owner overrides", () => {
    for (const patch of [
      { amount: "0" },
      { amount: "1.001" },
      { tagIds: [] },
      { tagIds: [...input.tagIds, ...input.tagIds] },
      { userId: input.tagIds[0] },
      { schedule: { period: "weekly", startDate: "2026-01-01" } },
      {
        schedule: {
          period: "fixed",
          startDate: "2026-02-30",
          endDate: "2026-03-01",
        },
      },
    ])
      expect(
        CreateSavingsGoalSchema.safeParse({ ...input, ...patch }).success,
      ).toBe(false);
    expect(
      UpdateSavingsGoalSchema.safeParse({ id: input.tagIds[0], goal: input })
        .success,
    ).toBe(false);
  });
});
