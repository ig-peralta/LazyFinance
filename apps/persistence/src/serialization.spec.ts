import { describe, expect, it } from "vitest";
import { wireValue } from "./serialization";

describe("wireValue", () => {
  it("types and serializes nested timestamps without changing exact numeric strings or JSON keys", () => {
    const at = new Date("2026-09-15T15:00:00.000Z");
    const input = {
      bookedAt: at,
      amount: "90071992547409.99",
      optional: null,
      facts: [{ provider_key: { MixedCaseKey: at, amount: "-0.01" } }],
    };
    const result = wireValue(input);
    const timestamp: string = result.bookedAt;
    const nestedTimestamp: string = result.facts[0].provider_key.MixedCaseKey;
    expect(result).toEqual({
      bookedAt: at.toISOString(),
      amount: input.amount,
      optional: null,
      facts: [
        { provider_key: { MixedCaseKey: at.toISOString(), amount: "-0.01" } },
      ],
    });
    expect(timestamp).toBe(at.toISOString());
    expect(nestedTimestamp).toBe(at.toISOString());
    expect(input.bookedAt).toBe(at);
    expect(input.facts[0].provider_key.MixedCaseKey).toBe(at);
  });

  it("preserves JSON primitives and nullable timestamps", () => {
    const input: { at: Date | null; values: readonly (Date | null)[] } = {
      at: null,
      values: [new Date("2026-09-01T04:00:00.000Z"), null],
    };
    const result = wireValue(input);
    const values: (string | null)[] = result.values;
    expect(values).toEqual(["2026-09-01T04:00:00.000Z", null]);
    expect(result.at).toBeNull();
    expect(wireValue("0.00")).toBe("0.00");
  });
});
