import { TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptySummary, rpcFailure, setupRpc } from "../../../../testing/rpc";
import { Summary } from "./summary";

const summary = {
  ...emptySummary,
  spending: "20000.00",
  tags: [
    {
      id: "food",
      name: "Comida",
      color: null,
      amount: "5000.00",
      grossAmount: "5000.00",
      refunds: "0.00",
      reimbursements: "0.00",
      count: 1,
    },
    {
      id: "leisure",
      name: "Ocio",
      color: null,
      amount: "10000.00",
      grossAmount: "10000.00",
      refunds: "0.00",
      reimbursements: "0.00",
      count: 1,
    },
  ],
};

describe("Summary resource view", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("shows exclusive tag totals ordered by spending without presenting income", async () => {
    setupRpc({ "summaries.monthly": () => summary });
    const fixture = TestBed.createComponent(Summary);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    for (const value of [
      "Gastos ·",
      "$20.000",
      "$10.000",
      "$5.000",
      "como máximo una",
      "compras sin etiqueta",
    ])
      expect(text).toContain(value);

    expect(text).not.toContain("Ingresos");
    const items = fixture.nativeElement.querySelectorAll("figure ol li");
    expect(items[0].textContent).toContain("Ocio");
    expect(items[1].textContent).toContain("Comida");
    const bars = fixture.nativeElement.querySelectorAll(
      '[data-testid="tag-bar"]',
    );
    expect(bars[0].style.width).toBe("100%");
    expect(bars[1].style.width).toBe("50%");
  });

  it("discloses unresolved movements without serializing the summary", async () => {
    setupRpc(
      {
        "summaries.monthly": () => ({ ...summary, unresolvedMovementCount: 2 }),
      },
      "server",
    );
    const fixture = TestBed.createComponent(Summary);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "Hay 2 movimientos por revisar",
    );
    expect(TestBed.inject(TransferState).toJson()).toBe("{}");
  });

  it("retries failed reads and shows the empty tagged-spending state", async () => {
    setupRpc({
      "summaries.monthly": vi
        .fn()
        .mockReturnValueOnce(rpcFailure())
        .mockReturnValueOnce(emptySummary),
    });
    const fixture = TestBed.createComponent(Summary);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "No pudimos cargar el resumen",
    );
    fixture.nativeElement
      .querySelector('[data-testid="retry-summary"]')
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "Sin gastos etiquetados",
    );
  });
});
