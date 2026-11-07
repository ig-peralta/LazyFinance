import { TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { setupRpc } from "../../../../testing/rpc";
import { BudgetProgressView } from "./budget-progress";

describe("Budget progress resource view", () => {
  afterEach(() => TestBed.resetTestingModule());
  it("displays overspending without hiding percentages above 100", async () => {
    setupRpc({
      "objectives.progress": () => [
        {
          id: "food",
          name: "Supermercado",
          month: "2026-09",
          period: "monthly",
          limit: "280000.00",
          spent: "300000.00",
          grossSpent: "300000.00",
          refunds: "0.00",
          reimbursements: "0.00",
          unresolvedAdjustmentCount: 0,
          adjustmentsAsOf: "2026-11-07T15:00:00Z",
          remaining: "-20000.00",
          percentage: 107,
          revisionId: "00000000-0000-4000-8000-000000000041",
          tracking: {
            start: "2026-09-01T04:00:00Z",
            end: "2026-10-01T03:00:00Z",
            archivedAt: null,
          },
        },
        {
          id: "trip",
          name: "Viaje",
          month: "2026-09",
          period: "yearly",
          limit: "650000.00",
          spent: "350000.00",
          grossSpent: "350000.00",
          refunds: "0.00",
          reimbursements: "0.00",
          unresolvedAdjustmentCount: 0,
          adjustmentsAsOf: "2026-11-07T15:00:00Z",
          remaining: "300000.00",
          percentage: 53,
          revisionId: "00000000-0000-4000-8000-000000000042",
          tracking: {
            start: "2026-01-01T03:00:00Z",
            end: "2026-10-01T03:00:00Z",
            archivedAt: null,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(BudgetProgressView);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain("107%");
    expect(text).toContain("Excedido por $20.000");
    expect(text).toContain("Disponible $300.000");
    const bars = fixture.nativeElement.querySelectorAll('[role="progressbar"]');
    expect(bars[0].getAttribute("aria-valuenow")).toBe("100");
    expect(bars[1].getAttribute("aria-valuenow")).toBe("53");
    expect(TestBed.inject(TransferState).toJson()).toBe("{}");
  });

  it("labels archived partial windows without replacing their original limit", async () => {
    setupRpc({
      "objectives.progress": () => [
        {
          id: "food",
          name: "Supermercado",
          month: "2026-09",
          period: "monthly",
          limit: "280000.00",
          spent: "20000.00",
          grossSpent: "35000.00",
          refunds: "10000.00",
          reimbursements: "5000.00",
          unresolvedAdjustmentCount: 1,
          adjustmentsAsOf: "2026-11-07T15:00:00Z",
          remaining: "260000.00",
          percentage: 7,
          revisionId: "00000000-0000-4000-8000-000000000041",
          tracking: {
            start: "2026-09-01T04:00:00Z",
            end: "2026-09-15T15:00:00Z",
            archivedAt: "2026-09-15T15:00:00Z",
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(BudgetProgressView);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain("Archivado");
    expect(text).toContain("fin excluido");
    expect(text).toContain("Se conserva el límite original");
    expect(text).toContain("$280.000");
    expect(text).toContain("$35.000");
    expect(text).toContain("$10.000");
    expect(text).toContain("$5.000");
    expect(text).toContain("El gasto usado es neto");
    expect(text).toContain("se permiten ajustes de compras anteriores");
    expect(text).toContain("1 ajustes por revisar; no se descuentan del gasto");
    expect(TestBed.inject(TransferState).toJson()).toBe("{}");
  });
});
