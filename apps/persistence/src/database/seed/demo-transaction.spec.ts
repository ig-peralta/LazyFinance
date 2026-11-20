import { describe, expect, it, vi } from "vitest";
import { planDemoTransaction } from "./demo-transaction";

const balances = {
  checking: "450000.00",
  savings: "300000.00",
  creditCard: "-10000.00",
};

describe("demo transaction templates", () => {
  it("builds both sides of each internal transfer with equal, opposite amounts", () => {
    for (const [index, from, to] of [
      [0, "checking", "savings"],
      [1, "savings", "checking"],
    ] as const) {
      const pick = vi.fn().mockReturnValueOnce(index).mockReturnValueOnce(3);
      const plan = planDemoTransaction("internal", balances, pick);
      expect(plan.movements).toHaveLength(2);
      expect(plan.movements[0].account).toBe(from);
      expect(plan.movements[1].account).toBe(to);
      expect(plan.movements[0].amount).toBe(-plan.movements[1].amount);
      expect(plan.movements.every((row) => row.isInternalMovement)).toBe(true);
      expect(plan.amount).toBe(`${plan.movements[1].amount}.00`);
      expect(plan.movements[0].amount).toBeGreaterThanOrEqual(-150_000);
    }
  });

  it("uses coherent account, direction and price pools for diverse external movements", () => {
    const merchants = new Set<string>();
    for (let index = 0; index < 10; index++) {
      const pick = vi.fn().mockReturnValueOnce(index).mockReturnValueOnce(1);
      const plan = planDemoTransaction("external", balances, pick);
      expect(plan.movements).toHaveLength(1);
      const [movement] = plan.movements;
      expect(movement.isInternalMovement).toBe(false);
      expect(Math.abs(movement.amount)).toBeGreaterThanOrEqual(5_000);
      expect(Math.abs(movement.amount)).toBeLessThanOrEqual(170_000);
      expect(movement.merchant.length).toBeGreaterThan(2);
      if (movement.account === "creditCard")
        expect(movement.amount).toBeLessThan(0);
      if (movement.amount > 0) expect(movement.account).toBe("checking");
      merchants.add(movement.merchant);
    }
    expect(merchants.size).toBe(10);
  });

  it("never overdraws checking or savings and still allows card purchases and credits", () => {
    const low = {
      checking: "3000.00",
      savings: "24000.00",
      creditCard: "-100.00",
    };
    expect(() => planDemoTransaction("internal", low)).toThrow(
      "Insufficient demo funds",
    );
    for (let index = 0; index < 6; index++) {
      const pick = vi.fn().mockReturnValueOnce(index).mockReturnValueOnce(0);
      const movement = planDemoTransaction("external", low, pick).movements[0];
      expect(movement.account === "checking" && movement.amount < 0).toBe(
        false,
      );
    }
    const capped = planDemoTransaction(
      "internal",
      { ...balances, checking: "27000.00", savings: "0.00" },
      () => 0,
    );
    expect(capped.movements[0].amount).toBe(-25_000);
  });
});
