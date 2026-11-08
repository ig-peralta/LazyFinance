import { UpdateTagSchema } from "@lazyfinance/contracts";
import { describe, expect, it } from "vitest";

describe("tag changes", () => {
  const id = "00000000-0000-4000-8000-000000000031";
  it("validates partial changes without silently clearing omitted colors", () => {
    expect(UpdateTagSchema.parse({ id, name: "  New  " })).toEqual({
      id,
      name: "New",
    });
    expect(UpdateTagSchema.parse({ id, color: null })).toEqual({
      id,
      color: null,
    });
    for (const changes of [
      {},
      { name: " " },
      { name: "x".repeat(81) },
      { color: "red" },
      { userId: id },
      { isArchived: true },
    ])
      expect(UpdateTagSchema.safeParse({ id, ...changes }).success).toBe(false);
  });
});
