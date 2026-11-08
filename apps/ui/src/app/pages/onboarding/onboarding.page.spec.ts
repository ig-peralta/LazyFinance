import { TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  budgetDetail,
  budgetRevision,
  incomeSource,
  principal,
  rpcFailure,
  savingsGoal,
  setupRpc,
} from "../../../testing/rpc";
import { OnboardingPreferences } from "../../features/onboarding/onboarding-preferences";
import { OnboardingPage } from "./onboarding.page";

describe("optional owner-scoped onboarding", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    window.localStorage.removeItem("lazyfinance:onboarding:v1:owner-a");
    window.localStorage.removeItem("lazyfinance:onboarding:v1:bob");
  });

  it("derives progress from persisted records, can skip/resume across visits and never creates duplicate financial data", async () => {
    const mock = setupRpc({
      "income.sources": (_input, call) =>
        call.authorization === "Bearer bob" ? [] : [incomeSource],
      "objectives.list": (_input, call) =>
        call.authorization === "Bearer bob"
          ? []
          : [
              { ...budgetRevision, id: budgetDetail.id, intent: "spending" },
              savingsGoal,
            ],
    });
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain("3 de 4 con registros");
    expect(root.textContent).toContain("Vinculación no disponible");
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Saltar por ahora"))
      ?.click();
    fixture.detectChanges();
    expect(
      window.localStorage.getItem("lazyfinance:onboarding:v1:owner-a"),
    ).toBe("skipped");
    fixture.destroy();
    const revisit = TestBed.createComponent(OnboardingPage);
    revisit.detectChanges();
    await revisit.whenStable();
    revisit.detectChanges();
    const revisitedRoot: HTMLElement = revisit.nativeElement;
    expect(revisitedRoot.textContent).toContain("Dejaste la guía para después");
    [...revisitedRoot.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Retomar la guía"))
      ?.click();
    revisit.detectChanges();
    expect(TestBed.inject(OnboardingPreferences).status()).toBe("active");
    mock.credentials.accept({ ...principal, userId: "bob" }, "bob");
    await revisit.whenStable();
    revisit.detectChanges();
    expect(revisitedRoot.textContent).toContain("0 de 4 con registros");
    expect(TestBed.inject(OnboardingPreferences).status()).toBe("active");
    expect(
      mock.calls.every((call) =>
        ["accounts.list", "income.sources", "objectives.list"].includes(
          call.procedure,
        ),
      ),
    ).toBe(true);
    expect(TestBed.inject(TransferState).toJson()).toBe("{}");
  });

  it("does not mark failed imports as complete and allows finishing with explicitly optional unresolved steps", async () => {
    setupRpc({ "accounts.list": () => rpcFailure() });
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain("No comprobado");
    expect(root.textContent).toContain("Un error no significa");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Terminar recorrido"))
      ?.click();
    fixture.detectChanges();
    expect(TestBed.inject(OnboardingPreferences).status()).toBe("completed");
    expect(root.textContent).toContain(
      "no implica que todas estén configuradas",
    );
    expect(root.textContent).toContain("no permite recordar la preferencia");
  });

  it("keeps owner preferences out of server rendering and protected transfer state", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem");
    setupRpc({}, "server");
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(TestBed.inject(OnboardingPreferences).status()).toBeUndefined();
    expect(
      get.mock.calls.filter(([key]) =>
        key.startsWith("lazyfinance:onboarding"),
      ),
    ).toHaveLength(0);
    expect(TestBed.inject(TransferState).toJson()).toBe("{}");
  });
});
