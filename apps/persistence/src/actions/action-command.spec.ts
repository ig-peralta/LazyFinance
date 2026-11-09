import { FinancialActionRequestSchema } from "@lazyfinance/contracts";
import { FinancialActionCommandSchema } from "@lazyfinance/contracts/internal";
import { describe, expect, it } from "vitest";
import { assertActionSelection } from "./action-command";

describe("financial action command selection binding", () => {
  const budget = FinancialActionRequestSchema.parse({
    kind: "create_budget",
    budget: {
      name: "Plan",
      amount: "1000.00",
      tagIds: ["00000000-0000-4000-8000-000000000001"],
      schedule: { period: "monthly", startDate: "2026-11-01" },
    },
  });
  const definition = {
    name: "Plan",
    amount: "1000.00",
    tagIds: ["00000000-0000-4000-8000-000000000001"],
    newTags: [],
    isRecurring: true,
    period: "monthly",
    startDate: "2026-11-01 00:00:00",
    endDate: null,
  };

  it("accepts API-normalized schedules without doing calendar calculations in persistence", () => {
    expect(() =>
      assertActionSelection(
        budget,
        FinancialActionCommandSchema.parse({
          kind: "create_budget",
          definition,
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    { name: "Different objective" },
    { amount: "2000.00" },
    { tagIds: ["00000000-0000-4000-8000-000000000002"] },
    { newTags: [{ name: "Undeclared dependent write", color: null }] },
  ])("rejects unpreviewed objective fields or dependent tag writes: %j", (change) => {
    expect(() =>
      assertActionSelection(
        budget,
        FinancialActionCommandSchema.parse({
          kind: "create_budget",
          definition: { ...definition, ...change },
        }),
      ),
    ).toThrow("must match");
  });

  it("binds non-objective commands to the exact target and payload", () => {
    const action = FinancialActionRequestSchema.parse({
      kind: "create_tag",
      tag: { name: "Shown" },
    });
    expect(() =>
      assertActionSelection(action, FinancialActionCommandSchema.parse(action)),
    ).not.toThrow();
    expect(() =>
      assertActionSelection(
        action,
        FinancialActionCommandSchema.parse({
          kind: "create_tag",
          tag: { name: "Hidden" },
        }),
      ),
    ).toThrow("must match");
    expect(() =>
      assertActionSelection(
        action,
        FinancialActionCommandSchema.parse({
          kind: "archive_tag",
          id: "00000000-0000-4000-8000-000000000001",
        }),
      ),
    ).toThrow("must match");
  });
});
