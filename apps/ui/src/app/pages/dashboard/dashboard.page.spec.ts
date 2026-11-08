import { TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { movement, setupRpc, tag, transactionPage } from "../../../testing/rpc";
import { TaggingData } from "../../features/tagging/tagging.data";
import { DashboardPage } from "./dashboard.page";

describe("DashboardPage data ownership", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("loads each view once and refreshes only tag-dependent reads after a decision", async () => {
    const { callsTo } = setupRpc({
      "transactions.list": () => transactionPage([movement]),
    });
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    for (const value of [
      "Hola, Camila Rojas",
      "Cuentas",
      "Tus últimos movimientos",
      "Presupuestos y metas",
      "Gastos por etiqueta",
      "Comparación de gastos",
      "Avance de presupuestos",
    ])
      expect(text).toContain(value);

    expect(text).toContain("Ingresos recibidos");
    expect(text).toContain("no es dinero disponible");

    for (const procedure of [
      "accounts.list",
      "transactions.list",
      "objectives.list",
      "summaries.monthly",
      "summaries.comparison",
      "objectives.progress",
    ] as const)
      expect(callsTo(procedure)).toHaveLength(1);

    await fixture.debugElement.injector
      .get(TaggingData)
      .choose(movement, tag, false, new AbortController().signal);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(callsTo("summaries.monthly")).toHaveLength(2);
    expect(callsTo("objectives.progress")).toHaveLength(2);

    for (const procedure of [
      "accounts.list",
      "transactions.list",
      "objectives.list",
      "summaries.comparison",
    ] as const)
      expect(callsTo(procedure)).toHaveLength(1);

    expect(TestBed.inject(TransferState).toJson()).toBe("{}");
  });
});
