import { describe, expect, it } from "vitest";
import { decodeBudgetCursor, encodeBudgetCursor } from "./budget-cursor";

const id = "00000000-0000-4000-8000-000000000041";
const other = "00000000-0000-4000-8000-000000000042";

describe("budget history cursors", () => {
  it("round-trips a revision boundary bound to one budget", () => {
    expect(decodeBudgetCursor(encodeBudgetCursor(id, 5), id)).toBe(5);
  });

  it("rejects malformed, noncanonical, unsupported and changed-budget cursors", () => {
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    for (const cursor of [
      "",
      "!",
      "x".repeat(2049),
      `${encodeBudgetCursor(id, 5)}=`,
      encode({ version: 2, budgetId: id, revision: 5 }),
      encode({ version: 1, budgetId: id, revision: 0 }),
      encode({ version: 1, budgetId: id, revision: 1.5 }),
      encode({ version: 1, budgetId: id, revision: 5, extra: true }),
      encodeBudgetCursor(other, 5),
    ])
      expect(() => decodeBudgetCursor(cursor, id)).toThrow(
        "Invalid budget history cursor",
      );
  });
});
