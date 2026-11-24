import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvironmentService } from "../../environment/environment.service";
import { BankingSyncRunner } from "./banking-sync-runner";
import { BankingSyncTimer } from "./banking-sync-timer";

async function setup(enabled: boolean) {
  const runOnce = vi.fn<BankingSyncRunner["runOnce"]>();
  const module = await Test.createTestingModule({
    providers: [
      BankingSyncTimer,
      { provide: EnvironmentService, useValue: { get: () => enabled } },
      { provide: BankingSyncRunner, useValue: { runOnce } },
    ],
  }).compile();
  return { module, runOnce, timer: module.get(BankingSyncTimer) };
}

describe("automatic banking timer", () => {
  afterEach(() => vi.useRealTimers());

  it("checks immediately and 30 seconds after settlement without overlapping runs", async () => {
    vi.useFakeTimers();
    const { module, runOnce, timer } = await setup(true);
    let finish = () => {};
    runOnce.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finish = () => resolve(undefined);
        }),
    );
    runOnce.mockResolvedValue(undefined);
    try {
      timer.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(0);
      expect(runOnce).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(runOnce).toHaveBeenCalledTimes(1);
      finish();
      await vi.advanceTimersByTimeAsync(29_999);
      expect(runOnce).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(runOnce).toHaveBeenCalledTimes(2);
    } finally {
      finish();
      await module.close();
    }
    expect(runOnce.mock.calls[1]?.[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runOnce).toHaveBeenCalledTimes(2);
  });

  it("does not wake when automation is disabled", async () => {
    vi.useFakeTimers();
    const { module, runOnce, timer } = await setup(false);
    try {
      timer.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(runOnce).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });
});
