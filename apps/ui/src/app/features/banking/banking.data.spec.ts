import { ApplicationRef, TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bankingConfiguration,
  bankingConnection,
} from "../../../testing/banking";
import { deferred } from "../../../testing/deferred";
import { principal, type RpcOutput, setupRpc } from "../../../testing/rpc";
import { BankingData } from "./banking.data";

async function settle() {
  TestBed.tick();
  await TestBed.inject(ApplicationRef).whenStable();
}

describe("banking resource credential lifetimes", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("keeps both protected reads idle until credentials are accepted and uses no transfer state", async () => {
    const mock = setupRpc({}, "browser", false);
    const data = TestBed.inject(BankingData);
    await settle();
    expect(data.configuration.status()).toBe("idle");
    expect(data.connections.status()).toBe("idle");
    expect(mock.calls).toHaveLength(0);

    mock.credentials.accept(principal, "verified");
    await settle();
    expect(mock.callsTo("banking.configuration")[0].authorization).toBe(
      "Bearer verified",
    );
    expect(mock.callsTo("banking.connections")[0].authorization).toBe(
      "Bearer verified",
    );
    expect(TestBed.inject(TransferState).isEmpty).toBe(true);
  });

  it("drops late connection and configuration results when the same user's token is replaced", async () => {
    const oldBanks = deferred<RpcOutput<"banking.connections">>();
    const oldConfiguration = deferred<RpcOutput<"banking.configuration">>();
    const mock = setupRpc({
      "banking.configuration": (_input, call) =>
        call.authorization === "Bearer alice"
          ? oldConfiguration.promise
          : { enabled: false },
      "banking.connections": (_input, call) =>
        call.authorization === "Bearer alice" ? oldBanks.promise : [],
    });
    const data = TestBed.inject(BankingData);
    TestBed.tick();
    await vi.waitFor(() =>
      expect(mock.callsTo("banking.connections")).toHaveLength(1),
    );

    mock.credentials.accept(principal, "refreshed");
    await settle();
    oldConfiguration.resolve(bankingConfiguration);
    oldBanks.resolve([bankingConnection]);
    await settle();
    expect(data.configuration.value()).toEqual({ enabled: false });
    expect(data.connections.value()).toEqual([]);
    for (const procedure of [
      "banking.connections",
      "banking.configuration",
    ] as const) {
      expect(mock.callsTo(procedure)).toHaveLength(2);
      expect(mock.callsTo(procedure)[0].options?.signal?.aborted).toBe(true);
      expect(mock.callsTo(procedure)[1].authorization).toBe("Bearer refreshed");
    }
  });

  it("conceals resolved connection facts on logout before another user finishes loading", async () => {
    const next = deferred<RpcOutput<"banking.connections">>();
    const mock = setupRpc({
      "banking.configuration": () => bankingConfiguration,
      "banking.connections": (_input, call) =>
        call.authorization === "Bearer alice"
          ? [bankingConnection]
          : next.promise,
    });
    const data = TestBed.inject(BankingData);
    await settle();
    expect(data.connections.value()).toEqual([bankingConnection]);
    mock.credentials.clear();
    TestBed.tick();
    expect(data.connections.value()).toEqual([]);
    expect(data.configuration.value()).toBeUndefined();

    mock.credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    TestBed.tick();
    expect(data.connections.value()).toEqual([]);
    next.resolve([]);
    await settle();
    expect(data.connections.value()).toEqual([]);
  });

  it("aborts both reads when their owner is destroyed", async () => {
    const configuration = deferred<RpcOutput<"banking.configuration">>();
    const banks = deferred<RpcOutput<"banking.connections">>();
    const mock = setupRpc({
      "banking.configuration": () => configuration.promise,
      "banking.connections": () => banks.promise,
    });
    const data = TestBed.inject(BankingData);
    TestBed.tick();
    await vi.waitFor(() =>
      expect(mock.callsTo("banking.connections")).toHaveLength(1),
    );
    data.configuration.destroy();
    data.connections.destroy();
    expect(
      mock.callsTo("banking.configuration")[0].options?.signal?.aborted,
    ).toBe(true);
    expect(
      mock.callsTo("banking.connections")[0].options?.signal?.aborted,
    ).toBe(true);
    configuration.resolve(bankingConfiguration);
    banks.resolve([bankingConnection]);
  });
});
