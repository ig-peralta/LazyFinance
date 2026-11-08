import { describe, expect, it } from "vitest";
import { fintocInitialHistoryWindow } from "./fintoc-history-window";

describe("bounded initial Fintoc history", () => {
  it.each([
    ["2026-11-09T01:00:00Z", "2026-08-11", "2026-11-08"],
    ["2026-11-09T04:00:00Z", "2026-08-12", "2026-11-09"],
    ["2026-04-05T16:00:00Z", "2026-01-06", "2026-04-05"],
    ["2026-09-06T15:00:00Z", "2026-06-09", "2026-09-06"],
    ["2024-03-01T15:00:00Z", "2023-12-03", "2024-03-01"],
  ])("uses an inclusive 90-day Santiago window at %s", (now, from, through) => {
    expect(fintocInitialHistoryWindow(new Date(now))).toEqual({
      from,
      through,
    });
  });
});
