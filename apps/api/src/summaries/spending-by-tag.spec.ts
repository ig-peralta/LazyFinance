import type { TaggedMovementAggregate } from "@lazyfinance/contracts/internal";
import { describe, expect, it } from "vitest";
import { spendingByTag } from "./spending-by-tag";

function group(
  update: Partial<TaggedMovementAggregate> = {},
): TaggedMovementAggregate {
  return {
    type: "debit",
    isInternalMovement: false,
    reviewStatus: "clear",
    hasReceipt: false,
    tag: { id: "food", name: "Comida", color: null },
    amount: "-10.01",
    count: 1,
    ...update,
  };
}

describe("spendingByTag", () => {
  it("combines a tag's factual groups using exact cents and deterministic amount/name ordering", () => {
    const archived = { id: "archived", name: "Archived", color: null };
    const other = { id: "other", name: "Other", color: "#abcdef" };
    expect(
      spendingByTag([
        group({ tag: other, amount: "-9007199254740.99" }),
        group({ tag: archived, amount: "-9007199254740.98", count: 2 }),
        group({ tag: archived, amount: "-0.01", hasReceipt: true }),
      ]),
    ).toEqual([
      { ...archived, amount: "9007199254740.99", count: 3 },
      { ...other, amount: "9007199254740.99", count: 1 },
    ]);
  });

  it("excludes untagged, credit, internal and unresolved groups from the breakdown", () => {
    expect(
      spendingByTag([
        group(),
        group({ tag: null }),
        group({ type: "credit", amount: "10.01" }),
        group({ isInternalMovement: true }),
        group({ isInternalMovement: null }),
        group({ reviewStatus: "needs_review" }),
      ]),
    ).toEqual([
      { id: "food", name: "Comida", color: null, amount: "10.01", count: 1 },
    ]);
    expect(spendingByTag([])).toEqual([]);
  });
});
