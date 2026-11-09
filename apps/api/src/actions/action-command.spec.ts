import {
  DirectFinancialActionSchema,
  FinancialActionRequestSchema,
  financialActionScopes,
} from "@lazyfinance/contracts";
import { describe, expect, it } from "vitest";
import { actionCommand } from "./action-command";

const now = new Date("2026-11-09T15:00:00Z");
describe("bounded financial action contracts and shared domain preparation", () => {
  it("uses exact money and the same Santiago budget/savings schedules, including dependent new tags", () => {
    const prepared = actionCommand(
      {
        kind: "create_budget",
        budget: {
          name: "Compras",
          amount: "150000.1",
          schedule: { period: "monthly", startDate: "2026-11-01" },
          newTags: [{ name: "Supermercado" }],
        },
      },
      now,
    );
    expect(prepared.command).toMatchObject({
      kind: "create_budget",
      definition: {
        amount: "150000.10",
        isRecurring: true,
        period: "monthly",
        startDate: "2026-11-01 00:00:00",
        newTags: [{ name: "Supermercado", color: null }],
      },
    });
    expect(financialActionScopes(prepared.action)).toEqual([
      "finance:budgets:write",
      "finance:tags:write",
    ]);
    expect(
      actionCommand(
        {
          kind: "create_savings_goal",
          goal: {
            name: "Calma",
            amount: "1000000",
            newTags: [{ name: "Ahorro" }],
            schedule: { period: "lifetime" },
          },
        },
        now,
      ).command,
    ).toMatchObject({
      definition: {
        kind: "amount_based",
        startDate: null,
        amount: "1000000.00",
      },
    });
  });

  it("rejects missing selections, duplicate new tags, owner/approval overrides and unsupported operations", () => {
    for (const value of [
      {
        kind: "create_budget",
        budget: {
          name: "Compras",
          amount: "1",
          schedule: { period: "monthly", startDate: "2026-11-01" },
        },
      },
      { kind: "create_tag", tag: { name: "Algo" }, approved: true },
      { kind: "create_tag", tag: { name: "Algo", userId: "other" } },
      { kind: "transfer_money", amount: "100" },
    ])
      expect(FinancialActionRequestSchema.safeParse(value).success).toBe(false);
    expect(() =>
      actionCommand(
        {
          kind: "create_budget",
          budget: {
            name: "Compras",
            amount: "1",
            newTags: [{ name: "A" }],
            schedule: { period: "monthly", startDate: "2026-10-01" },
          },
        },
        now,
      ),
    ).toThrow("current or a future");
  });

  it("requires a preview fingerprint for MCP changes to existing records, not an invented approval flag", () => {
    const input = {
      requestId: "00000000-0000-4000-8000-000000000001",
      action: {
        kind: "archive_tag",
        id: "00000000-0000-4000-8000-000000000002",
      },
    };
    expect(DirectFinancialActionSchema.safeParse(input).success).toBe(false);
    expect(
      DirectFinancialActionSchema.safeParse({
        ...input,
        expectedFingerprint: "a".repeat(64),
      }).success,
    ).toBe(true);
    expect(
      DirectFinancialActionSchema.safeParse({ ...input, approved: true })
        .success,
    ).toBe(false);
  });
});
