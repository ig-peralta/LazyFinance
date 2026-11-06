import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { RecentTransaction } from "@lazyfinance/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deferred,
  movement,
  rpcFailure,
  setupRpc,
  tag,
} from "../../../testing/rpc";
import { createTagDecision } from "./tag-decision";
import { TaggingData } from "./tagging.data";

@Component({ template: "" })
class DecisionHost {
  readonly transaction = signal<RecentTransaction>(movement);
  readonly decision = createTagDecision(this.transaction);
}

describe("component-lifetime tag commands", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("cancels a command on destruction and never publishes its late response", async () => {
    const response = deferred<unknown>();
    const { callsTo } = setupRpc({ "tags.decide": () => response.promise });
    const tagging = TestBed.inject(TaggingData);
    const fixture = TestBed.createComponent(DecisionHost);
    fixture.detectChanges();
    const saved = fixture.componentInstance.decision.choose(tag, false);
    await vi.waitFor(() => expect(callsTo("tags.decide")).toHaveLength(1));
    fixture.destroy();
    expect(await saved).toBe(false);
    expect(callsTo("tags.decide")[0].options?.signal?.aborted).toBe(true);
    response.resolve({ origin: "manual" });
    await Promise.resolve();
    expect(tagging.changed()).toBeUndefined();
  });

  it("does not let an old transaction failure overwrite a newer pending action", async () => {
    const first = deferred<unknown>(),
      second = deferred<unknown>();
    const { callsTo } = setupRpc({
      "tags.decide": (input) =>
        (input as { transactionId: string }).transactionId === movement.id
          ? first.promise
          : second.promise,
    });
    const fixture = TestBed.createComponent(DecisionHost);
    fixture.detectChanges();
    const { transaction, decision } = fixture.componentInstance;
    const old = decision.choose(tag, false);
    await vi.waitFor(() => expect(callsTo("tags.decide")).toHaveLength(1));
    transaction.set({ ...movement, id: "new-transaction" });
    const current = decision.choose(tag, false);
    await vi.waitFor(() => expect(callsTo("tags.decide")).toHaveLength(2));
    first.resolve(rpcFailure());
    expect(await old).toBe(false);
    expect(decision.saving()).toBe(true);
    expect(decision.error()).toBeNull();
    second.resolve({ origin: "manual" });
    expect(await current).toBe(true);
    expect(TestBed.inject(TaggingData).changed()?.selection.transactionId).toBe(
      "new-transaction",
    );
    expect(decision.saving()).toBe(false);
  });

  it("does not submit duplicate writes while a transaction command is pending", async () => {
    const response = deferred<unknown>();
    const { callsTo } = setupRpc({ "tags.decide": () => response.promise });
    const fixture = TestBed.createComponent(DecisionHost);
    fixture.detectChanges();
    const decision = fixture.componentInstance.decision;
    const first = decision.choose(tag, false);
    decision.clearError();
    expect(await decision.choose(tag, false)).toBe(false);
    await vi.waitFor(() => expect(callsTo("tags.decide")).toHaveLength(1));
    response.resolve({ origin: "manual" });
    expect(await first).toBe(true);
  });
});
