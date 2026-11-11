import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, santiagoDate } from "./date";

describe("Santiago date presentation", () => {
  it("keeps local calendar dates independent of the host timezone", () => {
    const instant = new Date("2026-11-12T02:30:00.000Z");
    expect(santiagoDate(instant)).toBe("2026-11-11");
    expect(formatDate(instant)).toMatch(/11.*nov.*2026/);
  });

  it("shows readable local date and time instead of raw ISO timestamps", () => {
    const value = formatDateTime(new Date("2026-11-11T15:30:00.000Z"));
    expect(value).toMatch(/11.*2026/);
    expect(value).toContain("12:30");
    expect(value).not.toContain("T15:30");
  });
});
