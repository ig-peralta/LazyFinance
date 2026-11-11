import { Component, inject } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { AssistantConsentState } from "@lazyfinance/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import {
  assistantConsent,
  principal,
  type RpcHandlers,
  rpcFailure,
  setupRpc,
} from "../../../testing/rpc";
import { AssistantConsentData } from "./assistant-consent.data";

@Component({ template: "", providers: [AssistantConsentData] })
class ConsentOwner {
  readonly consent = inject(AssistantConsentData);
}

const unset: AssistantConsentState = {
  ...assistantConsent,
  decision: "unset",
  revision: 0,
  decidedAt: null,
};

function setup(handlers: RpcHandlers = {}) {
  const mock = setupRpc(handlers);
  const fixture = TestBed.createComponent(ConsentOwner);
  fixture.detectChanges();
  return {
    ...mock,
    fixture,
    consent: fixture.componentInstance.consent,
    async settle() {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    },
  };
}

describe("account processing-consent reads and explicit decisions", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("fails closed on a failed read and recovers only by checking, without writing a default", async () => {
    let available = false;
    const f = setup({
      "assistant.consent": () => (available ? assistantConsent : rpcFailure()),
    });
    await f.settle();
    expect(f.consent.readError()).toBe(true);
    expect(f.consent.state()).toBeUndefined();
    expect(f.consent.allowed()).toBe(false);
    expect(await f.consent.decide("accepted")).toBe(false);
    expect(f.callsTo("assistant.decideConsent")).toHaveLength(0);
    available = true;
    f.consent.check();
    await f.settle();
    expect(f.consent.allowed()).toBe(true);
    expect(f.callsTo("assistant.decideConsent")).toHaveLength(0);
  });

  it("blocks admission but retains the confirmed state while an ordinary recheck is loading", async () => {
    const next = deferred<AssistantConsentState>();
    let reads = 0;
    const f = setup({
      "assistant.consent": () =>
        ++reads === 1 ? assistantConsent : next.promise,
    });
    await f.settle();
    expect(f.consent.allowed()).toBe(true);
    f.consent.reload();
    f.fixture.detectChanges();
    await vi.waitFor(() =>
      expect(f.callsTo("assistant.consent")).toHaveLength(2),
    );
    expect(f.consent.state()).toEqual(assistantConsent);
    expect(f.consent.allowed()).toBe(false);
    expect(f.consent.canDecide()).toBe(false);
    next.resolve(assistantConsent);
    await f.settle();
    expect(f.consent.allowed()).toBe(true);
  });

  it("suppresses duplicate decisions and rechecks during a pending save", async () => {
    const saved = deferred<AssistantConsentState>();
    const f = setup({
      "assistant.consent": () => unset,
      "assistant.decideConsent": () => saved.promise,
    });
    await f.settle();
    const saving = f.consent.decide("accepted");
    expect(await f.consent.decide("accepted")).toBe(false);
    expect(await f.consent.decide("refused")).toBe(false);
    f.consent.reload();
    f.consent.check();
    f.fixture.detectChanges();
    await vi.waitFor(() =>
      expect(f.callsTo("assistant.decideConsent")).toHaveLength(1),
    );
    expect(f.consent.pending()).toBe(true);
    expect(f.callsTo("assistant.consent")).toHaveLength(1);
    saved.resolve(assistantConsent);
    expect(await saving).toBe(true);
    await f.settle();
    expect(f.consent.allowed()).toBe(true);
    expect(f.consent.needsCheck()).toBe(false);
  });

  it("never lets an automatic or stale read reconcile an uncertain save", async () => {
    const stale = deferred<AssistantConsentState>();
    let reads = 0;
    const f = setup({
      "assistant.consent": () => {
        reads++;
        return reads === 1
          ? unset
          : reads === 2
            ? stale.promise
            : assistantConsent;
      },
      "assistant.decideConsent": () => rpcFailure(),
    });
    await f.settle();
    expect(await f.consent.decide("accepted")).toBe(false);
    expect(f.consent.needsCheck()).toBe(true);
    f.consent.reload();
    f.fixture.detectChanges();
    await vi.waitFor(() =>
      expect(f.callsTo("assistant.consent")).toHaveLength(2),
    );
    f.consent.check();
    f.fixture.detectChanges();
    await vi.waitFor(() => expect(f.consent.allowed()).toBe(true));
    stale.resolve(unset);
    await f.settle();
    expect(f.consent.state()).toEqual(assistantConsent);
    expect(f.callsTo("assistant.consent")[1].options?.signal?.aborted).toBe(
      true,
    );
    expect(f.callsTo("assistant.decideConsent")).toHaveLength(1);
  });

  it("keeps an uncertain latch through ordinary successful reads and failed explicit checks", async () => {
    let failingRead = false;
    const f = setup({
      "assistant.consent": () =>
        failingRead ? rpcFailure() : assistantConsent,
      "assistant.decideConsent": () => rpcFailure(),
    });
    await f.settle();
    expect(await f.consent.decide("refused")).toBe(false);
    f.consent.reload();
    await f.settle();
    expect(f.consent.state()?.decision).toBe("accepted");
    expect(f.consent.needsCheck()).toBe(true);
    expect(f.consent.allowed()).toBe(false);
    failingRead = true;
    f.consent.check();
    await f.settle();
    expect(f.consent.readError()).toBe(true);
    expect(f.consent.needsCheck()).toBe(true);
    expect(f.consent.canDecide()).toBe(false);
    failingRead = false;
    f.consent.check();
    await f.settle();
    expect(f.consent.allowed()).toBe(true);
    expect(f.callsTo("assistant.decideConsent")).toHaveLength(1);
  });

  it("reads the server's refused decision after an uncertain withdrawal without replaying it", async () => {
    let current: AssistantConsentState = assistantConsent;
    const f = setup({
      "assistant.consent": () => current,
      "assistant.decideConsent": () => {
        current = { ...assistantConsent, decision: "refused", revision: 2 };
        return rpcFailure();
      },
    });
    await f.settle();
    await f.consent.decide("refused");
    expect(f.consent.allowed()).toBe(false);
    f.consent.check();
    await f.settle();
    expect(f.consent.state()?.decision).toBe("refused");
    expect(f.consent.allowed()).toBe(false);
    expect(f.consent.canDecide()).toBe(true);
    expect(f.callsTo("assistant.decideConsent")).toHaveLength(1);
  });

  it("ignores late consent reads from the previous account", async () => {
    const old = deferred<AssistantConsentState>();
    const f = setup({
      "assistant.consent": (_input, call) =>
        call.authorization === "Bearer bob" ? unset : old.promise,
    });
    await vi.waitFor(() =>
      expect(f.callsTo("assistant.consent")).toHaveLength(1),
    );
    f.credentials.accept({ ...principal, userId: "bob" }, "bob");
    f.fixture.detectChanges();
    await vi.waitFor(() => expect(f.consent.state()).toEqual(unset));
    old.resolve(assistantConsent);
    await f.settle();
    expect(f.consent.state()).toEqual(unset);
    expect(f.consent.allowed()).toBe(false);
    expect(f.callsTo("assistant.consent")[0].options?.signal?.aborted).toBe(
      true,
    );
  });

  it("does not apply a previous account's late consent save or uncertainty to the new owner", async () => {
    const old = deferred<AssistantConsentState>();
    const f = setup({
      "assistant.consent": (_input, call) =>
        call.authorization === "Bearer bob" ? unset : assistantConsent,
      "assistant.decideConsent": () => old.promise,
    });
    await f.settle();
    const saving = f.consent.decide("refused");
    await vi.waitFor(() =>
      expect(f.callsTo("assistant.decideConsent")).toHaveLength(1),
    );
    f.credentials.accept({ ...principal, userId: "bob" }, "bob");
    f.fixture.detectChanges();
    await vi.waitFor(() => expect(f.consent.state()).toEqual(unset));
    old.resolve({ ...assistantConsent, decision: "refused", revision: 2 });
    expect(await saving).toBe(false);
    await f.settle();
    expect(f.consent.state()).toEqual(unset);
    expect(f.consent.needsCheck()).toBe(false);
    expect(f.consent.saveError()).toBe(false);
    expect(
      f.callsTo("assistant.decideConsent")[0].options?.signal?.aborted,
    ).toBe(true);
  });

  it("uses the newly checked policy and revision after a conflict, never the stale command", async () => {
    let current: AssistantConsentState = assistantConsent;
    const changed: AssistantConsentState = {
      ...unset,
      policy: { ...unset.policy, key: "b".repeat(64), model: "new-model" },
      revision: 7,
    };
    let writes = 0;
    const f = setup({
      "assistant.consent": () => current,
      "assistant.decideConsent": (input) => {
        if (++writes === 1) {
          current = changed;
          return rpcFailure("CONFLICT");
        }
        return {
          ...current,
          decision: input.decision,
          revision: input.expectedRevision + 1,
        };
      },
    });
    await f.settle();
    await f.consent.decide("refused");
    expect(f.consent.canDecide()).toBe(false);
    f.consent.check();
    await f.settle();
    expect(f.consent.state()).toEqual(changed);
    expect(f.consent.allowed()).toBe(false);
    expect(await f.consent.decide("accepted")).toBe(true);
    expect(f.callsTo("assistant.decideConsent")[1].input).toEqual({
      policyKey: changed.policy.key,
      expectedRevision: 7,
      decision: "accepted",
    });
  });
});
