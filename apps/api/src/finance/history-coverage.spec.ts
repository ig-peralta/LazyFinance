import { describe, expect, it } from "vitest";
import { coversObservedMonth } from "./history-coverage";

describe("observed Santiago history coverage", () => {
  const observed = "2026-11-22T16:00:00.000Z";
  const complete = {
    completeness: "complete" as const,
    from: "2026-10-01",
    through: "2026-11-22",
  };

  it("requires the full historical month or today's data for the partial current month", () => {
    expect(coversObservedMonth(complete, "2026-10", observed)).toBe(true);
    expect(coversObservedMonth(complete, "2026-11", observed)).toBe(true);
    expect(coversObservedMonth(complete, "2026-09", observed)).toBe(false);
    expect(
      coversObservedMonth(
        { ...complete, through: "2026-11-21" },
        "2026-11",
        observed,
      ),
    ).toBe(false);
  });

  it("does not treat unknown bounds or a partial provider declaration as a covered month", () => {
    expect(coversObservedMonth(undefined, "2026-10", observed)).toBe(false);
    expect(
      coversObservedMonth(
        { ...complete, completeness: "partial" },
        "2026-10",
        observed,
      ),
    ).toBe(false);
    expect(
      coversObservedMonth({ ...complete, through: null }, "2026-10", observed),
    ).toBe(false);
  });
});
