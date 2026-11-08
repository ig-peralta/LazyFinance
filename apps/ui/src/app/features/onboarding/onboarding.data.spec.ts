import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import {
  principal,
  type RpcOutput,
  rpcFailure,
  setupRpc,
} from "../../../testing/rpc";
import { OnboardingData } from "./onboarding.data";
import { OnboardingHint } from "./onboarding-hint";

describe("account-owned onboarding metadata and hints", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("hides hints while loading and after completion, including on another credential scope", async () => {
    const response = deferred<RpcOutput<"onboarding.state">>();
    const mock = setupRpc({
      "onboarding.state": (_input, call) =>
        call.authorization === "Bearer bob"
          ? { status: "skipped", completedAt: null }
          : response.promise,
    });
    const fixture = TestBed.createComponent(OnboardingHint);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(mock.callsTo("onboarding.state")).toHaveLength(1),
    );
    expect(fixture.nativeElement.querySelector("aside")).toBeNull();
    response.resolve({
      status: "completed",
      completedAt: "2026-11-08T15:00:00.000Z",
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("aside")).toBeNull();
    mock.credentials.accept({ ...principal, userId: "bob" }, "bob");
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(OnboardingData).status()).toBe("skipped");
    expect(fixture.nativeElement.querySelector("aside")).toBeNull();
    mock.credentials.clear();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(OnboardingData).status()).toBeUndefined();
  });

  it("dismisses only after a confirmed skip and cannot resurrect the hint from an older read", async () => {
    const stale = deferred<RpcOutput<"onboarding.state">>();
    let reads = 0;
    const mock = setupRpc({
      "onboarding.state": () =>
        ++reads === 1 ? { status: "active", completedAt: null } : stale.promise,
    });
    const fixture = TestBed.createComponent(OnboardingHint);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const data = TestBed.inject(OnboardingData);
    data.state.reload();
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(mock.callsTo("onboarding.state")).toHaveLength(2),
    );
    fixture.nativeElement
      .querySelector('button[aria-label="Omitir configuración inicial"]')
      .click();
    await vi.waitFor(() => expect(data.status()).toBe("skipped"));
    stale.resolve({ status: "active", completedAt: null });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("onboarding.state")[1].options?.signal?.aborted).toBe(
      true,
    );
    expect(data.status()).toBe("skipped");
    expect(fixture.nativeElement.querySelector("aside")).toBeNull();
  });

  it("does not show a new-user prompt when metadata is unavailable", async () => {
    setupRpc({ "onboarding.state": () => rpcFailure() });
    const fixture = TestBed.createComponent(OnboardingHint);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("aside")).toBeNull();
  });
});
