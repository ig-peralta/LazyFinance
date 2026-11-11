import type { ProviderScheduleCompletion } from "@lazyfinance/contracts/internal";

const RETRY_DELAYS = [5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

/** Application policy only: no timer, persistence or provider dependencies. */
export function syncScheduleCompletion(
  failureCount: number,
  now: Date,
  jitter: number,
  reason?: string,
  retryAfter?: string | null,
): ProviderScheduleCompletion {
  if (reason && reason !== "retryable")
    return { expectedFailureCount: failureCount, nextAttemptAt: null };
  const delay = reason
    ? RETRY_DELAYS[Math.min(failureCount, RETRY_DELAYS.length - 1)]
    : 60 * 60_000;
  const extra = Math.floor(
    Math.max(0, Math.min(1, jitter)) * (reason ? 60_000 : 5 * 60_000),
  );
  const providerTime = retryAfter ? Date.parse(retryAfter) : 0;
  return {
    expectedFailureCount: failureCount,
    nextAttemptAt: new Date(
      Math.max(
        now.getTime() + delay + extra,
        Number.isFinite(providerTime) ? providerTime : 0,
      ),
    ).toISOString(),
  };
}
