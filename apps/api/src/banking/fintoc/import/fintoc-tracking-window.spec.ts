import { describe, expect, it } from "vitest";
import { fintocTrackingWindow } from "./fintoc-tracking-window";

describe("connection-owned forward-only Fintoc tracking", () => {
  it.each([
    [
      "2026-11-09T01:00:00Z",
      "2026-11-09T02:00:00Z",
      "2026-11-08",
      "2026-11-08",
    ],
    [
      "2026-11-09T01:00:00Z",
      "2026-11-09T04:00:00Z",
      "2026-11-08",
      "2026-11-09",
    ],
    [
      "2026-04-05T02:30:00Z",
      "2026-04-05T16:00:00Z",
      "2026-04-04",
      "2026-04-05",
    ],
    [
      "2026-09-06T03:30:00Z",
      "2026-09-06T15:00:00Z",
      "2026-09-05",
      "2026-09-06",
    ],
    [
      "2024-02-29T02:00:00Z",
      "2024-03-01T15:00:00Z",
      "2024-02-28",
      "2024-03-01",
    ],
  ])("keeps the Santiago first-link day at %s through %s", (linkedAt, now, from, through) => {
    expect(fintocTrackingWindow(new Date(linkedAt), new Date(now))).toEqual({
      from,
      through,
    });
  });

  it("extends the tracked period without moving its start or silently imposing a rolling backfill cutoff", () => {
    const linkedAt = new Date("2026-01-01T15:00:00Z");
    expect(
      fintocTrackingWindow(linkedAt, new Date("2026-01-01T17:00:00Z")),
    ).toEqual({ from: "2026-01-01", through: "2026-01-01" });
    expect(
      fintocTrackingWindow(linkedAt, new Date("2026-11-08T17:00:00Z")),
    ).toEqual({ from: "2026-01-01", through: "2026-11-08" });
  });

  it("does not pretend that a booking day supplies an exact transaction-time cutoff", () => {
    expect(
      fintocTrackingWindow(
        new Date("2026-11-08T23:30:00Z"),
        new Date("2026-11-09T01:00:00Z"),
      ),
    ).toEqual({ from: "2026-11-08", through: "2026-11-08" });
  });

  it("rejects a future linking day instead of requesting history before it", () => {
    expect(() =>
      fintocTrackingWindow(
        new Date("2026-11-10T15:00:00Z"),
        new Date("2026-11-08T15:00:00Z"),
      ),
    ).toThrow("linking day is in the future");
  });
});
