import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { afterEach, describe, expect, it } from "vitest";
import { setupRpc, transactionDetail } from "../../../../testing/rpc";
import { TransactionPage } from "./transaction.page";

describe("concise movement disclosure", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("keeps booked facts and uncertainty outside secondary disclosure and retains return filters", async () => {
    const mock = setupRpc({
      "transactions.detail": () => ({
        ...transactionDetail,
        reviewStatus: "needs_review",
        isInternalMovement: null,
        providerInternalAssessment: "unknown",
      }),
    });
    mock.navigate.mockRestore();
    TestBed.inject(Router).resetConfig([
      { path: "movimientos/:id", component: TransactionPage },
    ]);
    const harness = await RouterTestingHarness.create(
      `/movimientos/${transactionDetail.id}?merchant=Mercado&internal=unknown`,
    );
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root: HTMLElement = harness.fixture.nativeElement;
    const disclosure = root.querySelector("details");
    expect(disclosure?.open).toBe(false);
    expect(disclosure?.querySelector("summary")?.textContent).toBe(
      "Cómo afecta a tus totales",
    );
    expect(root.querySelector(".detail-facts")?.textContent).toContain(
      "Sin determinar",
    );
    expect(root.querySelector(".detail-facts")?.textContent).toContain(
      "sin revisar",
    );
    expect(root.querySelector(".metric-value")?.textContent).toContain(
      "15.000",
    );
    const warning = root.querySelector(".notice.warning");
    expect(warning?.textContent).toContain("hechos pendientes de revisión");
    expect(warning?.closest("details")).toBeNull();
    expect(root.querySelector("a")?.getAttribute("href")).toContain(
      "merchant=Mercado",
    );
    expect(root.querySelector("a")?.getAttribute("href")).toContain(
      "internal=unknown",
    );
  });
});
