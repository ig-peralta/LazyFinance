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

  it("renders a labelled distribution with exact legend amounts and untagged spending", async () => {
    setupRpc({ "summaries.monthly": () => summary });
    const fixture = TestBed.createComponent(Summary);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    for (const value of [
      "Gastos por etiqueta",
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
    expect(items[0].textContent).toContain("50%");
    expect(items[1].textContent).toContain("Comida");
    expect(items[1].textContent).toContain("25%");
    expect(items[2].textContent).toContain("Sin etiqueta");
    const segments = fixture.nativeElement.querySelectorAll(
      '[data-testid="spending-segment"]',
    );
    expect(segments).toHaveLength(3);
    expect(segments[0].getAttribute("stroke-dasharray")).toBe("50 50");
    expect(segments[1].getAttribute("stroke-dasharray")).toBe("25 75");
    const figure = fixture.nativeElement.querySelector("figure");
    expect(figure.getAttribute("aria-labelledby")).toBe("summary-heading");
    expect(figure.getAttribute("aria-describedby")).toBe("chart-note");
    expect(
      fixture.nativeElement.querySelector("details summary").textContent,
    ).toContain("Ver desglose");
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

  it("distinguishes original purchase net cost from recovered cash and pending corrections", async () => {
    setupRpc({
      "summaries.monthly": () => ({
        ...emptySummary,
        grossSpending: "100000.00",
        refunds: "30000.00",
        reimbursements: "20000.00",
        spending: "50000.00",
        recoveredExpenseCredits: {
          amount: "4000.00",
          count: 1,
          needsReviewCount: 1,
        },
        unresolvedAdjustmentCount: 1,
      }),
    });
    const fixture = TestBed.createComponent(Summary);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    for (const value of [
      "Gastos netos",
      "$100.000",
      "$30.000",
      "$20.000",
      "$50.000",
      "$4.000",
      "compra original",
      "No son ingresos",
      "ajustes de gastos por revisar",
    ])
      expect(text).toContain(value);
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
    expect(fixture.nativeElement.textContent).toContain(
      "No hay gasto neto para graficar",
    );
    expect(fixture.nativeElement.querySelector("figure")).toBeNull();
  });

  it("keeps exact details but withholds a misleading ring for inconsistent amounts", async () => {
    setupRpc({ "summaries.monthly": () => ({ ...summary, spending: "1.00" }) });
    const fixture = TestBed.createComponent(Summary);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "No podemos representar estos importes",
    );
    expect(fixture.nativeElement.querySelector("figure")).toBeNull();
    expect(
      fixture.nativeElement.querySelector("details").textContent,
    ).toContain("$10.000");
  });
});
