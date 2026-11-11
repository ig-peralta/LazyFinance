import { describe, expect, it } from "vitest";
import { syncScheduleCompletion } from "./sync-schedule-policy";

const now = new Date("2026-11-10T12:00:00.000Z");

describe("portable synchronization scheduling policy", () => {
  it("schedules successful snapshots independently of source freshness", () => {
    expect(syncScheduleCompletion(4, now, 0)).toEqual({
      expectedFailureCount: 4,
      nextAttemptAt: "2026-11-10T13:00:00.000Z",
    });
    expect(syncScheduleCompletion(0, now, 1).nextAttemptAt).toBe(
      "2026-11-10T13:05:00.000Z",
    );
  });

  it.each([
    [0, 5],
    [1, 15],
    [2, 60],
    [3, 360],
    [8, 360],
  ])("bounds failure %i backoff to %i minutes", (count, minutes) => {
    expect(
      Date.parse(
        syncScheduleCompletion(count, now, 0, "retryable").nextAttemptAt ?? "",
      ) - now.getTime(),
    ).toBe(minutes * 60_000);
  });

  it("never shortens a provider waiting period", () => {
    expect(
      syncScheduleCompletion(0, now, 0, "retryable", "2026-11-12T12:00:00.000Z")
        .nextAttemptAt,
    ).toBe("2026-11-12T12:00:00.000Z");
    expect(syncScheduleCompletion(0, now, 1, "retryable").nextAttemptAt).toBe(
      "2026-11-10T12:06:00.000Z",
    );
  });

  it.each([
    "expired",
    "revoked",
    "invalid_data",
    "account_unavailable",
  ])("does not schedule blind retries for %s", (reason) => {
    expect(syncScheduleCompletion(0, now, 0, reason)).toEqual({
      expectedFailureCount: 0,
      nextAttemptAt: null,
    });
  });
});
