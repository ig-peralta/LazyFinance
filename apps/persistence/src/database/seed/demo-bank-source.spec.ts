import { DemoBankSourceSchema } from "@lazyfinance/contracts/internal";
import { describe, expect, it } from "vitest";
import { buildDemoBankSource } from "./demo-bank-source";
import { openingBalances } from "./profile";

describe("simulated bank seed", () => {
  it("produces a complete selected trio and a separate discoverable trio from the historical ledger", () => {
    const asOf = new Date("2026-11-24T23:00:00.000Z");
    const { inventory, movements, entries } = buildDemoBankSource(asOf);
    expect(inventory.map((row) => row.externalId)).toEqual([
      "demo-main-checking",
      "demo-main-savings",
      "demo-main-creditCard",
      "demo-extra-checking",
      "demo-extra-savings",
      "demo-extra-credit-card",
    ]);
    expect(entries.length).toBeGreaterThan(500);
    expect(movements).toHaveLength(entries.length * 2);
    expect(
      movements
        .slice(0, entries.length)
        .every((row) => row.accountExternalId.startsWith("demo-main-")),
    ).toBe(true);
    expect(
      movements
        .slice(entries.length)
        .every((row) => row.accountExternalId.startsWith("demo-extra-")),
    ).toBe(true);
    expect(inventory.slice(3).map((row) => row.balance)).toEqual(
      inventory.slice(0, 3).map((row) => row.balance),
    );
    for (const [index, key] of [
      "checking",
      "savings",
      "creditCard",
    ].entries()) {
      const total = movements
        .filter((row) => row.accountExternalId === inventory[index].externalId)
        .reduce((sum, row) => sum + Number(row.amount), 0);
      expect(Number(inventory[index].balance)).toBe(
        openingBalances[key as keyof typeof openingBalances] + total,
      );
    }
    const paired = movements.filter((row) => row.relatedMovement);
    expect(paired.length).toBeGreaterThan(0);
    for (const row of paired) {
      const match = movements.find(
        (other) => other.externalId === row.relatedMovement?.externalId,
      );
      expect(match?.relatedMovement?.externalId).toBe(row.externalId);
      expect(Number(match?.amount)).toBe(-Number(row.amount));
    }
    expect(
      DemoBankSourceSchema.safeParse({
        connectionId: "00000000-0000-4000-8000-000000000001",
        updatedAt: asOf.toISOString(),
        accounts: inventory,
        movements,
        failure: null,
        prepared: false,
      }).success,
    ).toBe(true);
  });
});
