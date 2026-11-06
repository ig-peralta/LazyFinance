import { TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rpcFailure, setupRpc } from "../../../../testing/rpc";
import { Objective } from "./objective";

describe("Objective resource view", () => {
  afterEach(() => TestBed.resetTestingModule());
  it("separates spending limits from savings targets without exporting private hydration state", async () => {
    setupRpc(
      {
        "objectives.list": () => [
          {
            id: "budget",
            name: "Supermercado",
            amount: "280000.00",
            kind: "time_based",
            intent: "spending",
            isRecurring: true,
            period: "monthly",
            startDate: "2024-01-01T15:00:00.000Z",
            endDate: null,
            tags: [{ id: "food", name: "Compras", color: null }],
          },
          {
            id: "goal",
            name: "Fondo de emergencia",
            amount: "6500000.00",
            kind: "amount_based",
            intent: "saving",
            isRecurring: null,
            period: null,
            startDate: null,
            endDate: null,
            tags: [],
          },
        ],
      },
      "server",
    );
    const fixture = TestBed.createComponent(Objective);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    for (const value of [
      "Presupuestos de gasto",
      "Supermercado",
      "Mensual",
      "$280.000",
      "Compras",
      "Metas de ahorro",
      "Fondo de emergencia",
      "Sin fecha límite",
      "$6.500.000",
    ])
      expect(text).toContain(value);
    expect(text).not.toContain("%");
    expect(TestBed.inject(TransferState).toJson()).toBe("{}");
  });

  it("uses resource reload for retry and empty states", async () => {
    setupRpc({
      "objectives.list": vi
        .fn()
        .mockReturnValueOnce(rpcFailure())
        .mockReturnValueOnce([]),
    });
    const fixture = TestBed.createComponent(Objective);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "No pudimos cargar tus objetivos",
    );
    fixture.nativeElement
      .querySelector('[data-testid="retry-objectives"]')
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "Aún no hay presupuestos ni metas",
    );
  });
});
