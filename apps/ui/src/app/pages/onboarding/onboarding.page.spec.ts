import { TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { OnboardingState } from "@lazyfinance/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import {
  budgetDetail,
  budgetRevision,
  incomeSource,
  principal,
  rpcFailure,
  savingsGoal,
  setupRpc,
} from "../../../testing/rpc";
import { OnboardingData } from "../../features/onboarding/onboarding.data";
import { OnboardingPage } from "./onboarding.page";

const completed = {
  status: "completed",
  completedAt: "2026-11-08T15:00:00.000Z",
} satisfies OnboardingState;

function button(root: HTMLElement, label: string) {
  const found = [...root.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(label),
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

describe("optional account-persisted onboarding", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it("derives financial progress from records and resumes skipped guides without reactivating reminders", async () => {
    let state: OnboardingState = { status: "active", completedAt: null };
    const mock = setupRpc({
      "onboarding.state": (_input, call) =>
        call.authorization === "Bearer bob"
          ? { status: "active", completedAt: null }
          : state,
      "onboarding.finish": ({ status }) => {
        state =
          status === "completed" ? completed : { status, completedAt: null };
        return state;
      },
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
    expect(root.textContent).not.toContain("Importación pendiente");
    expect(
      root.querySelector('a[href="/conexiones-bancarias?from=onboarding"]')
        ?.textContent,
    ).toContain("Conectar banco");
    expect(root.textContent).toContain("Mi cuenta → Conexiones bancarias");
    expect(root.textContent).toContain(
      "Planificar no confirma ingresos recibidos.",
    );
    button(root, "Saltar por ahora").click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("onboarding.finish")[0].input).toEqual({
      status: "skipped",
    });
    expect(TestBed.inject(OnboardingData).status()).toBe("skipped");
    fixture.destroy();

    const revisit = TestBed.createComponent(OnboardingPage);
    revisit.detectChanges();
    await revisit.whenStable();
    revisit.detectChanges();
    expect(revisit.nativeElement.textContent).toContain(
      "sin volver a activar los recordatorios",
    );
    expect(
      revisit.nativeElement.querySelector(
        'a[href="/conexiones-bancarias?from=onboarding"]',
      ),
    ).not.toBeNull();
    mock.credentials.accept({ ...principal, userId: "bob" }, "bob");
    await revisit.whenStable();
    revisit.detectChanges();
    expect(revisit.nativeElement.textContent).toContain("0 de 4 con registros");
    expect(TestBed.inject(OnboardingData).status()).toBe("active");
    expect(
      mock.calls.every((call) =>
        [
          "onboarding.state",
          "onboarding.finish",
          "accounts.list",
          "income.sources",
          "objectives.list",
        ].includes(call.procedure),
      ),
    ).toBe(true);
    expect(TestBed.inject(TransferState).toJson()).toBe("{}");
  });

  it("allows completing with failed or optional financial steps, waits for persistence and redirects", async () => {
    const response = deferred<OnboardingState>();
    const mock = setupRpc({
      "accounts.list": () => rpcFailure(),
      "onboarding.finish": () => response.promise,
    });
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain("No comprobado");
    expect(root.textContent).toContain("Un error no significa");
    const finish = button(root, "Listo, ir al resumen");
    finish.click();
    finish.click();
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(mock.callsTo("onboarding.finish")).toHaveLength(1),
    );
    expect(finish.disabled).toBe(true);
    expect(mock.navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(OnboardingData).status()).toBe("active");
    response.resolve(completed);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(OnboardingData).status()).toBe("completed");
    expect(root.querySelector("h1")).toBeNull();
    expect(mock.navigate).toHaveBeenCalledWith("/dashboard", {
      replaceUrl: true,
    });
  });

  it("does not pretend a failed command completed the guide or automatically retry it", async () => {
    const mock = setupRpc({ "onboarding.finish": () => rpcFailure() });
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    button(fixture.nativeElement, "Listo, ir al resumen").click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(OnboardingData).status()).toBe("active");
    expect(fixture.nativeElement.textContent).toContain(
      "No pudimos confirmar el resultado",
    );
    expect(mock.callsTo("onboarding.finish")).toHaveLength(1);
    expect(mock.navigate).not.toHaveBeenCalled();
  });

  it("discards completion for an obsolete owner without redirecting or changing the new owner", async () => {
    const response = deferred<OnboardingState>();
    const mock = setupRpc({ "onboarding.finish": () => response.promise });
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    button(fixture.nativeElement, "Listo, ir al resumen").click();
    await vi.waitFor(() =>
      expect(mock.callsTo("onboarding.finish")).toHaveLength(1),
    );
    mock.credentials.accept({ ...principal, userId: "bob" }, "bob");
    fixture.detectChanges();
    response.resolve(completed);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("onboarding.finish")[0].options?.signal?.aborted).toBe(
      true,
    );
    expect(TestBed.inject(OnboardingData).status()).toBe("active");
    expect(mock.navigate).not.toHaveBeenCalled();
  });

  it("reads completed status on SSR, redirects old URLs and never uses browser storage or transfer state", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem"),
      set = vi.spyOn(Storage.prototype, "setItem");
    const mock = setupRpc({ "onboarding.state": () => completed }, "server");
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(OnboardingData).status()).toBe("completed");
    expect(fixture.nativeElement.querySelector("h1")).toBeNull();
    expect(mock.navigate).toHaveBeenCalledWith("/dashboard", {
      replaceUrl: true,
    });
    expect(mock.calls.map((call) => call.procedure)).toEqual([
      "onboarding.state",
    ]);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(TestBed.inject(TransferState).toJson()).toBe("{}");
  });

  it("does not interpret an unavailable onboarding read as a pending guide", async () => {
    const mock = setupRpc({
      "onboarding.state": vi
        .fn()
        .mockReturnValueOnce(rpcFailure())
        .mockReturnValueOnce({ status: "active", completedAt: null }),
    });
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(OnboardingData).status()).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain(
      "No asumimos que esté pendiente",
    );
    expect(mock.callsTo("accounts.list")).toHaveLength(0);
    button(fixture.nativeElement, "Reintentar").click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("h1")).not.toBeNull();
  });
});
