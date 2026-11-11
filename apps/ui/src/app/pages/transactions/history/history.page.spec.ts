import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { afterEach, describe, expect, it } from "vitest";
import { eventsIn } from "../../../../testing/dom";
import {
  movement,
  principal,
  type RpcHandlers,
  rpcFailure,
  setupRpc,
  tag,
  transactionDetail,
  transactionPage,
} from "../../../../testing/rpc";
import { TransactionPage } from "../detail/transaction.page";
import { HistoryPage } from "./history.page";
import {
  emptyHistoryFields,
  historyInput,
  historyMonthRange,
} from "./history-filters";

describe("owned history workspace", () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup(url = "/movimientos", handlers: RpcHandlers = {}) {
    const mock = setupRpc({
      "transactions.list": () => transactionPage([movement]),
      ...handlers,
    });
    mock.navigate.mockRestore();
    TestBed.inject(Router).resetConfig([
      { path: "movimientos", component: HistoryPage },
    ]);
    const harness = await RouterTestingHarness.create(url);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root: HTMLElement = harness.fixture.nativeElement;
    const event = eventsIn(root);
    const settle = async () => {
      harness.detectChanges();
      await harness.fixture.whenStable();
      harness.detectChanges();
    };
    const open = async () => {
      root
        .querySelector<HTMLButtonElement>(
          'button[aria-controls="history-filters"]',
        )
        ?.click();
      await settle();
    };
    const field = (id: string, value: string) => {
      const input = root.querySelector<HTMLInputElement | HTMLSelectElement>(
        `#${id}`,
      );
      if (!input) throw new Error(`Missing filter: ${id}`);
      input.value = value;
      input.dispatchEvent(
        event(input.tagName === "SELECT" ? "change" : "input", {
          bubbles: true,
        }),
      );
    };
    const apply = async () => {
      root
        .querySelector("#history-filters form")
        ?.dispatchEvent(event("submit", { bubbles: true, cancelable: true }));
      await settle();
    };
    return { mock, harness, root, event, settle, open, field, apply };
  }

  it("offers pagination before and after results without duplicate IDs and discloses cursor limitations", async () => {
    const { root } = await setup();
    const pagers = root.querySelectorAll("nav.pagination");
    expect(pagers).toHaveLength(2);
    expect(pagers[0]?.getAttribute("aria-label")).not.toBe(
      pagers[1]?.getAttribute("aria-label"),
    );
    expect(
      pagers[0]?.nextElementSibling?.classList.contains("desktop-ledger"),
    ).toBe(true);
    const paginationDetails = root.querySelector("details");
    expect(paginationDetails?.open).toBe(false);
    expect(paginationDetails?.textContent).toContain("no sumes páginas");
    const ids = [...root.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps manual no-tag, unreviewed and automatic classifications distinct in both ledger layouts", async () => {
    const { root } = await setup("/movimientos", {
      "transactions.list": () =>
        transactionPage([
          {
            ...movement,
            id: "00000000-0000-4000-8000-000000000061",
            tag: null,
            tagDecisionOrigin: "manual",
          },
          {
            ...movement,
            id: "00000000-0000-4000-8000-000000000062",
            tag: null,
            tagDecisionOrigin: "unreviewed",
          },
          {
            ...movement,
            id: "00000000-0000-4000-8000-000000000063",
            tag,
            tagDecisionOrigin: "rule",
          },
        ]),
    });
    for (const selector of [".desktop-ledger tbody tr", ".mobile-ledger li"]) {
      const rows = root.querySelectorAll(selector);
      expect(rows[0]?.textContent).toContain("Sin etiqueta");
      expect(rows[0]?.textContent).toContain("Tu decisión");
      expect(rows[1]?.textContent).toContain("Sin etiqueta");
      expect(rows[1]?.textContent).toContain("Sin revisar");
      expect(rows[2]?.textContent).toContain(tag.name);
      expect(rows[2]?.textContent).toContain("Regla automática");
    }
  });

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
    expect(toggle?.getAttribute("aria-label")).toBe(
      "Filtros del historial: 3 aplicados",
    );
    expect(root.querySelector("#history-from")).toBeNull();
    const reads = mock.callsTo("transactions.list").length;
    toggle?.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelector("#history-filters")).not.toBeNull();
    expect(root.querySelector("dialog")).toBeNull();
    expect(toggle?.getAttribute("aria-haspopup")).toBeNull();
    expect(mock.callsTo("transactions.list")).toHaveLength(reads);
    root
      .querySelector<HTMLButtonElement>('[aria-label="Contraer filtros"]')
      ?.click();
    harness.detectChanges();
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

  it("stages advanced filters without changing results, discards cancellation and applies a validated selection", async () => {
    const page = await setup("/movimientos?merchant=Mercado");
    const { root, mock, open, settle, field, apply } = page;
    const reads = mock.callsTo("transactions.list").length;
    await open();
    field("history-from", "2026-09-01");
    field("history-before", "2026-09-01");
    await apply();
    expect(root.textContent).toContain("Revisa el rango");
    expect(root.querySelector("#history-filters")).not.toBeNull();
    expect(mock.callsTo("transactions.list")).toHaveLength(reads);
    expect(TestBed.inject(Router).url).toBe("/movimientos?merchant=Mercado");
    root
      .querySelector<HTMLButtonElement>('[aria-label="Contraer filtros"]')
      ?.click();
    await settle();
    await open();
    expect(root.querySelector<HTMLInputElement>("#history-from")?.value).toBe(
      "",
    );
    field("history-from", "2026-09-01");
    field("history-before", "2026-10-01");
    field("history-tag", "untagged");
    field("history-internal", "unknown");
    expect(mock.callsTo("transactions.list")).toHaveLength(reads);
    await apply();
    expect(root.querySelector("#history-filters")).toBeNull();
    expect(mock.callsTo("transactions.list").at(-1)?.input).toMatchObject({
      bookedFrom: "2026-09-01",
      bookedBefore: "2026-10-01",
      merchant: "Mercado",
      tagId: null,
      isInternalMovement: null,
    });
    expect(TestBed.inject(Router).url).not.toContain("=all");
    expect(root.textContent).toContain("Desde: 01/09/2026");
    expect(root.textContent).toContain("Sin etiqueta");
    expect(root.textContent).toContain("Sin determinar");
  });

  it("uses quick direction controls and removes one chip without losing the other filters", async () => {
    const { root, mock, settle } = await setup(
      `/movimientos?merchant=Mercado&tag=${tag.id}&internal=external`,
    );
    root
      .querySelector<HTMLButtonElement>('[aria-label="Solo abonos"]')
      ?.click();
    await settle();
    expect(
      root
        .querySelector('[aria-label="Solo abonos"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(mock.callsTo("transactions.list").at(-1)?.input).toMatchObject({
      merchant: "Mercado",
      tagId: tag.id,
      type: "credit",
      isInternalMovement: false,
    });
    root
      .querySelector<HTMLButtonElement>(
        '[aria-label="Quitar filtro Comercio: Mercado"]',
      )
      ?.click();
    await settle();
    const input = mock.callsTo("transactions.list").at(-1)?.input;
    expect(input).not.toHaveProperty("merchant");
    expect(input).toMatchObject({
      tagId: tag.id,
      type: "credit",
      isInternalMovement: false,
    });
    expect(
      root.querySelector<HTMLInputElement>("#history-merchant")?.value,
    ).toBe("");
    root
      .querySelector<HTMLButtonElement>('[aria-label="Todos los movimientos"]')
      ?.click();
    await settle();
    expect(mock.callsTo("transactions.list").at(-1)?.input).not.toHaveProperty(
      "type",
    );
    expect(mock.callsTo("transactions.list").at(-1)?.input).toMatchObject({
      tagId: tag.id,
      isInternalMovement: false,
    });
  });

  it("restores URL selections on navigation and keeps restorable drafts separate from clearing applied filters", async () => {
    const { root, harness, open, settle, apply } = await setup(
      "/movimientos?direction=debit&from=2026-09-01",
    );
    await open();
    [...root.querySelectorAll<HTMLButtonElement>("#history-filters button")]
      .find((button) => button.textContent?.trim() === "Restablecer")
      ?.click();
    await settle();
    expect(TestBed.inject(Router).url).toContain("direction=debit");
    expect(root.querySelector<HTMLInputElement>("#history-from")?.value).toBe(
      "",
    );
    await apply();
    expect(TestBed.inject(Router).url).toBe("/movimientos");
    expect(root.querySelector(".history-applied-filters")).toBeNull();
    await harness.navigateByUrl("/movimientos?direction=debit&from=2026-09-01");
    await settle();
    expect(
      root
        .querySelector('[aria-label="Solo cargos"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      root.querySelector('[aria-label="Quitar filtro Desde: 01/09/2026"]'),
    ).not.toBeNull();
    await open();
    expect(root.querySelector<HTMLInputElement>("#history-from")?.value).toBe(
      "2026-09-01",
    );
  });

  it("preserves selected account and tag IDs even when their catalogs fail", async () => {
    const { root, mock, open, apply } = await setup(
      `/movimientos?account=${movement.account.id}&tag=${tag.id}`,
      {
        "accounts.list": () => rpcFailure(),
        "tags.list": () => rpcFailure(),
      },
    );
    await open();
    expect(
      root.querySelector<HTMLSelectElement>("#history-account")?.value,
    ).toBe(movement.account.id);
    expect(root.querySelector<HTMLSelectElement>("#history-tag")?.value).toBe(
      tag.id,
    );
    expect(root.textContent).toContain("Tus selecciones se conservan");
    await apply();
    expect(mock.callsTo("transactions.list").at(-1)?.input).toMatchObject({
      accountId: movement.account.id,
      tagId: tag.id,
    });
    expect(root.querySelector("#history-filters")).toBeNull();
  });

  it("closes owner-specific drafts when the accepted account changes", async () => {
    const { root, mock, open, settle, field } = await setup("/movimientos", {
      "transactions.list": (_input, call) =>
        transactionPage(call.authorization === "Bearer bob" ? [] : [movement]),
    });
    field("history-merchant", "Búsqueda privada sin aplicar");
    await open();
    field("history-from", "2026-01-01");
    mock.credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    await settle();
    expect(root.querySelector("#history-filters")).toBeNull();
    expect(
      root.querySelector<HTMLInputElement>("#history-merchant")?.value,
    ).toBe("");
    expect(root.textContent).not.toContain("Búsqueda privada");
    expect(root.textContent).not.toContain("Mercado");
  });

  it("expands inline, toggles closed and returns keyboard focus without hiding the ledger", async () => {
    const { root, event, open, settle, mock } = await setup();
    const toggle = root.querySelector<HTMLButtonElement>(
      '[aria-controls="history-filters"]',
    );
    if (!toggle) throw new Error("Missing disclosure button");
    const reads = mock.callsTo("transactions.list").length;
    await open();
    const panel = root.querySelector<HTMLElement>("#history-filters");
    expect(root.querySelector(".history-ledger-panel")?.contains(panel)).toBe(
      true,
    );
    expect(root.querySelector("dialog")).toBeNull();
    expect(root.querySelector('a[href^="/movimientos/"]')).not.toBeNull();
    toggle.click();
    await settle();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector("#history-filters")).toBeNull();
    await open();
    const input = root.querySelector<HTMLInputElement>("#history-from");
    if (!input) throw new Error("Missing date input");
    input.focus();
    const keydown = event("keydown", { bubbles: true });
    Object.defineProperty(keydown, "key", { value: "Escape" });
    input.dispatchEvent(keydown);
    await settle();
    expect(root.querySelector("#history-filters")).toBeNull();
    expect(root.ownerDocument.activeElement).toBe(toggle);
    expect(mock.callsTo("transactions.list")).toHaveLength(reads);
  });

  it.each([
    "apply",
    "search",
    "direction",
  ] as const)("keeps inline search and staged filters together when confirming with %s", async (action) => {
    const { root, field, open, apply, settle, event, mock } = await setup(
      "/movimientos?merchant=Mercado",
    );
    await open();
    field("history-from", "2026-09-01");
    field("history-tag", "untagged");
    field("history-merchant", "Supermercado");
    if (action === "apply") await apply();
    else {
      if (action === "search")
        root
          .querySelector(".history-search")
          ?.dispatchEvent(event("submit", { bubbles: true, cancelable: true }));
      else
        root
          .querySelector<HTMLButtonElement>('[aria-label="Solo abonos"]')
          ?.click();
      await settle();
    }
    expect(mock.callsTo("transactions.list").at(-1)?.input).toMatchObject({
      merchant: "Supermercado",
      bookedFrom: "2026-09-01",
      tagId: null,
      ...(action === "direction" ? { type: "credit" } : {}),
    });
    expect(root.querySelector("#history-filters")).toBeNull();
  });

  it("restores an unsubmitted search when a reset draft is collapsed without applying", async () => {
    const { root, field, open, settle } = await setup(
      "/movimientos?merchant=Mercado",
    );
    field("history-merchant", "Búsqueda pendiente");
    await open();
    [...root.querySelectorAll<HTMLButtonElement>("#history-filters button")]
      .find((button) => button.textContent?.trim() === "Restablecer")
      ?.click();
    await settle();
    expect(
      root.querySelector<HTMLInputElement>("#history-merchant")?.value,
    ).toBe("");
    root
      .querySelector<HTMLButtonElement>('[aria-label="Contraer filtros"]')
      ?.click();
    await settle();
    expect(
      root.querySelector<HTMLInputElement>("#history-merchant")?.value,
    ).toBe("Búsqueda pendiente");
    expect(TestBed.inject(Router).url).toBe("/movimientos?merchant=Mercado");
  });

  it.each([
    ["2026-09", 0, "2026-09-01", "2026-10-01"],
    ["2026-12", 0, "2026-12-01", "2027-01-01"],
    ["2026-01", -1, "2025-12-01", "2026-01-01"],
    ["2024-02", 0, "2024-02-01", "2024-03-01"],
  ])("builds an exclusive calendar window for %s with offset %i", (month, offset, from, before) => {
    expect(historyMonthRange(String(month), Number(offset))).toEqual({
      from,
      before,
    });
  });
});
