import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decodeSelectionCursor,
  encodeSelectionCursor,
} from "./selection-cursor";

describe("selection-bound movement cursor", () => {
  it("preserves microseconds and rejects changed filters or malformed boundaries", () => {
    const id = randomUUID(),
      bookedAt = "2026-09-30T03:00:00.000001Z";
    const cursor = encodeSelectionCursor("owned-selection", bookedAt, id);
    expect(decodeSelectionCursor(cursor, "owned-selection")).toMatchObject({
      id,
      bookedAt,
    });
    for (const invalid of [
      "!",
      `${cursor}=`,
      "x".repeat(2049),
      encodeSelectionCursor("owned-selection", "2026-09-30T03:00:00Z", id),
    ])
      expect(() => decodeSelectionCursor(invalid, "owned-selection")).toThrow(
        /Invalid cursor/,
      );
    expect(() => decodeSelectionCursor(cursor, "different-selection")).toThrow(
      /changed selection/,
    );
  });
});
