import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { afterEach, describe, expect, it } from "vitest";
import { eventsIn } from "../../../testing/dom";
import {
  movement,
  principal,
  setupRpc,
  transactionDetail,
  transactionPage,
} from "../../../testing/rpc";
import { HistoryPage } from "./history.page";
import { emptyHistoryFields, historyInput } from "./history-filters";
import { TransactionPage } from "./transaction.page";

describe("owned history workspace", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("binds validated URL filters to cursor pages, resets pagination on filtering and opens owned source detail", async () => {
    const mock = setupRpc({
      "transactions.list": (input) =>
        transactionPage(
          [
            {
              ...movement,
              merchant: input.cursor ? "Página siguiente" : "Mercado",
            },
          ],
          input.cursor ? null : "opaque-next",
        ),
    });
    mock.navigate.mockRestore();
    TestBed.inject(Router).resetConfig([
      { path: "movimientos", component: HistoryPage },
      { path: "movimientos/:id", component: TransactionPage },
    ]);
    const harness = await RouterTestingHarness.create(
      "/movimientos?merchant=Mercado&direction=debit&internal=external",
    );
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(mock.callsTo("transactions.list").at(-1)?.input).toMatchObject({
      merchant: "Mercado",
      type: "debit",
      isInternalMovement: false,
      limit: 25,
    });
    const root: HTMLElement = harness.fixture.nativeElement;
    const event = eventsIn(root);
    const toggle = root.querySelector<HTMLButtonElement>(
      'button[aria-controls="history-filters"]',
    );
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.textContent).toContain("3 aplicados");
    const reads = mock.callsTo("transactions.list").length;
    toggle?.click();
    harness.detectChanges();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(
      root
        .querySelector("#history-filters")
        ?.classList.contains("filters-open"),
    ).toBe(true);
    expect(mock.callsTo("transactions.list")).toHaveLength(reads);
    const next = [...root.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Siguiente"),
    );
    next?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(mock.callsTo("transactions.list").at(-1)?.input.cursor).toBe(
      "opaque-next",
    );
    expect(root.textContent).toContain("Página siguiente");
    const merchant = root.querySelector<HTMLInputElement>("#history-merchant");
    if (!merchant) throw new Error("Missing filter");
    merchant.value = "Tienda%_";
    merchant.dispatchEvent(event("input"));
    root
      .querySelector("form")
      ?.dispatchEvent(event("submit", { bubbles: true, cancelable: true }));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toContain("Tienda");
    expect(mock.callsTo("transactions.list").at(-1)?.input).toMatchObject({
      merchant: "Tienda%_",
    });
    expect(
      mock.callsTo("transactions.list").at(-1)?.input.cursor,
    ).toBeUndefined();
    await harness.navigateByUrl(`/movimientos/${movement.id}`, TransactionPage);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(root.textContent).toContain("Importado del proveedor");
    expect(root.textContent).toContain("Externo");
    expect(mock.callsTo("transactions.detail").at(-1)?.input).toEqual({
      id: movement.id,
    });
  });

  it("clears old-owner pages and never treats malformed date selections as an unfiltered read", async () => {
    const mock = setupRpc({
      "transactions.list": (_input, call) =>
        transactionPage(call.authorization === "Bearer bob" ? [] : [movement]),
      "transactions.detail": () => transactionDetail,
    });
    mock.navigate.mockRestore();
    TestBed.inject(Router).resetConfig([
      { path: "movimientos", component: HistoryPage },
    ]);
    const harness = await RouterTestingHarness.create("/movimientos");
    await harness.fixture.whenStable();
    harness.detectChanges();
    mock.credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.fixture.nativeElement.textContent).not.toContain("Mercado");
    const before = mock.callsTo("transactions.list").length;
    await harness.navigateByUrl("/movimientos?from=2026-02-30", HistoryPage);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.fixture.nativeElement.textContent).toContain(
      "Los filtros del enlace no son válidos",
    );
    expect(mock.callsTo("transactions.list")).toHaveLength(before);
    expect(
      historyInput({
        ...emptyHistoryFields(),
        from: "2026-09-01",
        before: "2026-09-01",
      }).success,
    ).toBe(false);
  });
});
