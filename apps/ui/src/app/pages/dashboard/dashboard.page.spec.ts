import { TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { eventsIn } from "../../../testing/dom";
import {
  emptySummary,
  movement,
  savingsGoal,
  setupRpc,
  tag,
  transactionPage,
} from "../../../testing/rpc";
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
      "Metas de ahorro",
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

    await fixture.componentRef.injector
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

  it("separates spending, confirmed income and the plan, with direct workflow shortcuts", async () => {
    setupRpc({
      "summaries.monthly": () => ({
        ...emptySummary,
        spending: "123456.78",
        receivedIncome: "1500000.01",
        expectedIncome: {
          amount: "1700000.02",
          estimatedAmount: "200000.00",
          unknownAmountCount: 2,
          paymentCount: 4,
        },
      }),
    });
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const cards = [...root.querySelectorAll(".dashboard-metrics article")];
    expect(
      cards.map((card) => card.querySelector("strong")?.textContent),
    ).toEqual(["$123.456,78", "$1.500.000,01", "$1.700.000,02"]);
    expect(cards[1].textContent).toContain("No es tu saldo");
    expect(
      cards[1].querySelector('a[href^="/ingresos?"]')?.textContent,
    ).toContain("Revisar ingresos recibidos");
    expect(cards[2].textContent).toContain("no es dinero disponible");
    expect(cards[2].textContent).toContain("$200.000 en estimaciones");
    expect(cards[2].textContent).toContain("2 importes por definir");
    expect(
      [...root.querySelectorAll(".dashboard-shortcuts a")].map((a) =>
        a.getAttribute("href"),
      ),
    ).toEqual([
      "/movimientos",
      expect.stringMatching(/^\/ingresos\?month=/),
      expect.stringMatching(/^\/presupuestos-y-metas\?month=/),
      "/metas",
    ]);
    expect(
      [...(root.querySelector(".dashboard-sections")?.children ?? [])]
        .slice(0, 2)
        .map((element) => element.tagName),
    ).toEqual(["DASHBOARD-ACCOUNT", "DASHBOARD-ACTIVITY"]);
    expect(root.querySelector(".dashboard-analysis")?.children[0].tagName).toBe(
      "DASHBOARD-SUMMARY",
    );
  });

  it("updates all month-dependent panels together without refetching accounts or recent activity", async () => {
    const { callsTo } = setupRpc({ "objectives.list": () => [savingsGoal] });
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const picker = fixture.nativeElement.querySelector(
      'input[type="month"]',
    ) as HTMLInputElement;
    picker.value = "2000-02";
    picker.dispatchEvent(eventsIn(picker)("change", { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    for (const procedure of [
      "summaries.monthly",
      "summaries.comparison",
      "objectives.progress",
      "objectives.savingsProgress",
    ] as const) {
      expect(callsTo(procedure)).toHaveLength(2);
      expect(callsTo(procedure).at(-1)?.input).toMatchObject({
        month: "2000-02",
      });
    }
    for (const procedure of [
      "accounts.list",
      "objectives.list",
      "transactions.list",
    ] as const)
      expect(callsTo(procedure)).toHaveLength(1);
    picker.value = "2999-01";
    picker.dispatchEvent(eventsIn(picker)("change", { bubbles: true }));
    await fixture.whenStable();
    expect(callsTo("summaries.monthly")).toHaveLength(2);
  });
});
