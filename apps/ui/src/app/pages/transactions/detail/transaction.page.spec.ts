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

  it("reacts to bounded budget and income return context without rereading movement facts", async () => {
    const mock = setupRpc();
    mock.navigate.mockRestore();
    const router = TestBed.inject(Router);
    router.resetConfig([
      { path: "movimientos/:id", component: TransactionPage },
    ]);
    const budget = "00000000-0000-4000-8000-000000000051";
    const revision = "00000000-0000-4000-8000-000000000052";
    const path = `/movimientos/${transactionDetail.id}`;
    const harness = await RouterTestingHarness.create(
      `${path}?returnTo=budget-evidence&budget=${budget}&revision=${revision}&month=2026-11&asOf=2026-11-11T12:00:00.000Z&adjustmentsAsOf=2026-11-11T12:00:00.000Z&reported=15000.00&merchant=omit`,
    );
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root: HTMLElement = harness.fixture.nativeElement;
    const back = () => {
      const href = root.querySelector("a.page-back")?.getAttribute("href");
      if (!href) throw new Error("Missing movement return link");
      return new URL(href, "https://lazyfinance.invalid");
    };
    expect(back().pathname).toBe(`/presupuestos/${budget}/movimientos`);
    expect(back().searchParams.get("revision")).toBe(revision);
    expect(back().searchParams.get("month")).toBe("2026-11");
    expect(back().searchParams.get("asOf")).toBe("2026-11-11T12:00:00.000Z");
    expect(back().searchParams.get("adjustmentsAsOf")).toBe(
      "2026-11-11T12:00:00.000Z",
    );
    expect(back().searchParams.get("reported")).toBe("15000.00");
    expect(back().searchParams.has("merchant")).toBe(false);
    const reads = mock.callsTo("transactions.detail").length;

    await harness.navigateByUrl(
      `${path}?returnTo=income&month=2026-10&merchant=omit`,
    );
    harness.detectChanges();
    expect(back().pathname).toBe("/ingresos");
    expect(back().search).toBe("?month=2026-10");
    expect(mock.callsTo("transactions.detail")).toHaveLength(reads);

    await harness.navigateByUrl(
      `${path}?returnTo=https://example.invalid&budget=${budget}`,
    );
    harness.detectChanges();
    expect(back().pathname).toBe("/movimientos");
    expect(back().search).toBe("");
  });
});
