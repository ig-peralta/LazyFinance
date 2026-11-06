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
          remaining: "-20000.00",
          percentage: 107,
        },
        {
          id: "trip",
          name: "Viaje",
          month: "2026-09",
          period: "yearly",
          limit: "650000.00",
          spent: "350000.00",
          remaining: "300000.00",
          percentage: 53,
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
});
