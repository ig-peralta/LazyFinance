import { describe, expect, it } from "vitest";
import {
  compareObjectiveBoundaries,
  objectiveLocalTime,
} from "./objective-time";

describe("objective observation boundaries", () => {
  it("preserves SQL microseconds while using Santiago calendar boundaries", () => {
    expect(objectiveLocalTime("2026-11-01T03:00:00.123456Z")).toBe(
      "2026-11-01 00:00:00.123456",
    );
    expect(
      compareObjectiveBoundaries("2026-09-01T04:00:00Z", "2026-09-01 00:00:00"),
    ).toBe(0);
    expect(
      compareObjectiveBoundaries("2026-10-01T03:00:00Z", "2026-10-01 00:00:00"),
    ).toBe(0);
    expect(
      compareObjectiveBoundaries(
        "2026-11-01T03:00:00.123456Z",
        "2026-11-01T03:00:00.123457Z",
      ),
    ).toBe(-1);
    expect(
      compareObjectiveBoundaries(
        "2026-11-01T03:00:00.123Z",
        "2026-11-01T03:00:00.123000Z",
      ),
    ).toBe(0);
  });

  it("orders actual instants through Santiago's repeated DST hour", () => {
    const earlier = "2026-04-05T02:50:00.000000Z";
    const later = "2026-04-05T03:10:00.000000Z";
    expect(objectiveLocalTime(earlier) > objectiveLocalTime(later)).toBe(true);
    expect(compareObjectiveBoundaries(earlier, later)).toBe(-1);
    expect(compareObjectiveBoundaries(later, earlier)).toBe(1);
  });
});
