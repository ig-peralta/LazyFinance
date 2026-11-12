import { TestBed } from "@angular/core/testing";
import {
  type FinancialAction,
  FinancialActionRequestSchema,
} from "@lazyfinance/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantAction } from "../../../../testing/assistant";
import { deferred } from "../../../../testing/deferred";
import {
  principal,
  type RpcHandlers,
  rpcFailure,
  setupRpc,
} from "../../../../testing/rpc";
import { AssistantActionCard } from "./assistant-action-card";

function setup(overrides: RpcHandlers = {}, action = assistantAction()) {
  const rpc = setupRpc({ "financialActions.get": () => action, ...overrides });
  const fixture = TestBed.createComponent(AssistantActionCard);
  fixture.componentRef.setInput("action", action);
  fixture.componentRef.setInput("approvableTurn", true);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const button = (text: string) => {
    const node = [...root.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === text,
    );
    if (!node) throw new Error(`Missing ${text}`);
    return node;
  };
  return { ...rpc, fixture, root, render, button };
}

describe("explicit, scope-bound assistant approval cards", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it("shows the tag's actual color as a swatch rather than a visible hex code", () => {
    const f = setup(
      {},
      assistantAction({
        request: {
          kind: "create_tag",
          tag: { name: "Comida", color: "#87CEEB" },
        },
      }),
    );
    const swatch = f.root.querySelector<HTMLElement>(".action-color-swatch");
    expect(swatch?.style.backgroundColor).toBe("rgb(135, 206, 235)");
    expect(f.root.textContent).not.toContain("#87CEEB");
    expect(f.root.textContent).toContain("Color personalizado");
  });

  it("edits with a native color picker and an explicit no-color choice, while preserving hex only in the RPC payload", async () => {
    const action = assistantAction({
      request: {
        kind: "create_tag",
        tag: { name: "Comida", color: "#87CEEB" },
      },
    });
    const f = setup(
      {
        "financialActions.revise": (input) => ({
          ...action,
          version: input.version + 1,
          request: FinancialActionRequestSchema.parse(input.action),
        }),
      },
      action,
    );
    f.button("Editar").click();
    await f.render();
    const picker = f.root.querySelector<HTMLInputElement>(
      'input[name="action-color"]',
    );
    if (!picker) throw new Error("Missing color picker");
    expect(picker.type).toBe("color");
    expect(picker.value).toBe("#87ceeb");
    expect(f.root.textContent).not.toMatch(/hexadecimal|#87ceeb/i);
    picker.value = "#112233";
    picker.dispatchEvent(new Event("input", { bubbles: true }));
    f.root
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await f.render();
    expect(f.callsTo("financialActions.revise")[0].input).toMatchObject({
      action: { tag: { color: "#112233" } },
    });
    expect(
      f.root.querySelector<HTMLElement>(".action-color-swatch")?.style
        .backgroundColor,
    ).toBe("rgb(17, 34, 51)");
    f.button("Editar").click();
    await f.render();
    f.root
      .querySelector<HTMLInputElement>('input[name="action-no-color"]')
      ?.click();
    await f.render();
    expect(
      f.root.querySelector<HTMLInputElement>('input[name="action-color"]')
        ?.disabled,
    ).toBe(true);
    f.root
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await f.render();
    expect(f.callsTo("financialActions.revise")[1].input).toMatchObject({
      action: { tag: { color: null } },
    });
    expect(
      f.root.querySelector(".action-color-swatch.no-color"),
    ).not.toBeNull();
    expect(f.root.textContent).toContain("Sin color");
    expect(f.callsTo("financialActions.approve")).toHaveLength(0);
  });

  it("corrects the color of a budget's new tag in the same request and accepts only the revised version", async () => {
    const action = assistantAction({
      request: {
        kind: "create_budget",
        budget: {
          name: "Burger King",
          amount: "100000.00",
          tagIds: [],
          newTags: [{ name: "Burger King", color: "#ef4444" }],
          schedule: { period: "monthly", startDate: "2026-12-01" },
        },
      },
    });
    let current = action;
    const f = setup(
      {
        "tags.list": () => [],
        "financialActions.revise": (input) => {
          current = {
            ...current,
            version: input.version + 1,
            request: FinancialActionRequestSchema.parse(input.action),
          };
          return current;
        },
        "financialActions.approve": (input) => {
          current = {
            ...current,
            version: input.version,
            status: "applied",
          };
          return current;
        },
      },
      action,
    );
    expect(
      f.root.querySelector<HTMLElement>(".action-color-swatch")?.style
        .backgroundColor,
    ).toBe("rgb(239, 68, 68)");
    f.button("Editar").click();
    await f.render();
    const picker = f.root.querySelector<HTMLInputElement>(
      'input[type="color"]',
    );
    if (!picker) throw new Error("Missing dependent tag color picker");
    expect(picker.value).toBe("#ef4444");
    picker.value = "#112233";
    picker.dispatchEvent(new Event("input", { bubbles: true }));
    f.button("Guardar revisión").click();
    await f.render();
    expect(f.callsTo("financialActions.revise")[0].input).toMatchObject({
      id: action.id,
      version: 1,
      action: {
        kind: "create_budget",
        budget: { newTags: [{ name: "Burger King", color: "#112233" }] },
      },
    });
    expect(f.callsTo("tags.create")).toHaveLength(0);
    expect(f.callsTo("financialActions.approve")).toHaveLength(0);
    f.button("Crear presupuesto").click();
    await f.render();
    expect(f.callsTo("financialActions.approve")[0].input).toEqual({
      id: action.id,
      version: 2,
    });
    expect(f.root.textContent).toContain("Cambio confirmado");
    expect(
      f.root.querySelector<HTMLElement>(".action-color-swatch")?.style
        .backgroundColor,
    ).toBe("rgb(17, 34, 51)");
  });

  it("does not save an outdated manual form over a newer voice correction", async () => {
    const action = assistantAction();
    const f = setup({}, action);
    f.button("Editar").click();
    await f.render();
    f.fixture.componentRef.setInput("action", {
      ...action,
      version: 2,
      request: {
        kind: "create_tag",
        tag: { name: "Corregida por voz", color: "#112233" },
      },
    });
    await f.render();
    expect(f.button("Guardar revisión").disabled).toBe(true);
    expect(f.root.textContent).toContain("versión más reciente");
    expect(f.callsTo("financialActions.revise")).toHaveLength(0);
  });

  it("never executes on render or an incomplete turn, and submits only the exact ID/version on approval", async () => {
    const action = assistantAction(),
      pending = deferred<FinancialAction>();
    const f = setup(
      { "financialActions.approve": () => pending.promise },
      action,
    );
    expect(f.calls).toEqual([]);
    f.fixture.componentRef.setInput("approvableTurn", false);
    f.fixture.detectChanges();
    expect(f.button("Guardar etiqueta").disabled).toBe(true);
    f.fixture.componentRef.setInput("approvableTurn", true);
    f.fixture.detectChanges();
    f.button("Guardar etiqueta").click();
    f.button("Guardar etiqueta").click();
    await vi.waitFor(() =>
      expect(
        f.calls.filter((call) => call.procedure === "financialActions.approve"),
      ).toHaveLength(1),
    );
    expect(f.calls[0].input).toEqual({ id: action.id, version: 1 });
    pending.resolve({
      ...action,
      status: "applied",
      results: [
        {
          id: action.id,
          title: "Supermercado",
          path: "/etiquetas",
          outcome: "created",
        },
      ],
    });
    await f.render();
    expect(f.root.textContent).toContain("Cambio confirmado");
    expect(f.root.querySelector('a[href="/etiquetas"]')).not.toBeNull();
    expect(f.root.textContent).not.toContain("Pendiente de tu aprobación");
  });

  it("allows explicit approval of a saved interrupted-voice proposal after warning the user", async () => {
    const action = assistantAction();
    const f = setup(
      {
        "financialActions.approve": (input) => ({
          ...action,
          version: input.version,
          status: "applied",
        }),
      },
      action,
    );
    f.fixture.componentRef.setInput("approvableTurn", true);
    f.fixture.componentRef.setInput("interruptedVoiceTurn", true);
    await f.render();

    expect(f.root.textContent).toContain("La respuesta de voz se interrumpió");
    expect(f.button("Guardar etiqueta").disabled).toBe(false);
    f.button("Guardar etiqueta").click();
    await f.render();
    expect(f.callsTo("financialActions.approve")).toHaveLength(1);
    expect(f.root.textContent).toContain("Cambio confirmado");
  });

  it("edits a proposal without executing, then approves its new version", async () => {
    const action = assistantAction();
    const f = setup(
      {
        "financialActions.revise": (input) => ({
          ...action,
          version: 2,
          request: FinancialActionRequestSchema.parse(input.action),
        }),
        "financialActions.approve": (input) => ({
          ...action,
          version: input.version,
          status: "applied",
        }),
      },
      action,
    );
    f.button("Editar").click();
    await f.render();
    const name = f.root.querySelector<HTMLInputElement>(
      'input[name="action-name"]',
    );
    if (!name) throw new Error("Missing name");
    name.value = "Comida";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    f.root
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await f.render();
    expect(
      f.calls.filter((call) => call.procedure === "financialActions.approve"),
    ).toHaveLength(0);
    expect(f.root.textContent).toContain("Comida");
    f.button("Guardar etiqueta").click();
    await f.render();
    expect(
      f.calls.find((call) => call.procedure === "financialActions.approve")
        ?.input,
    ).toEqual({ id: action.id, version: 2 });
  });

  it("blocks another write after an uncertain result until an explicit status read reconciles it", async () => {
    const action = assistantAction();
    const f = setup({
      "financialActions.approve": () => rpcFailure(),
      "financialActions.get": () => ({ ...action, status: "applied" }),
    });
    f.button("Guardar etiqueta").click();
    await f.render();
    expect(f.button("Guardar etiqueta").disabled).toBe(true);
    expect(f.root.textContent).toContain("resultado es incierto");
    f.button("Consultar estado de la acción").click();
    await f.render();
    expect(f.root.textContent).toContain("Cambio confirmado");
    expect(f.calls.map((call) => call.procedure)).toEqual([
      "financialActions.approve",
      "financialActions.get",
    ]);
  });

  it("handles stale/expired/cancelled proposals honestly and renders untrusted names as text", async () => {
    const action = assistantAction({
      status: "stale",
      request: {
        kind: "create_tag",
        tag: { name: '<img src="evil">', color: null },
      },
    });
    const f = setup(
      { "financialActions.cancel": () => ({ ...action, status: "cancelled" }) },
      action,
    );
    expect(f.root.querySelector("img")).toBeNull();
    expect(f.button("Guardar etiqueta").disabled).toBe(true);
    expect(f.root.textContent).toContain("Necesita revisión");
    f.button("Cancelar").click();
    await f.render();
    expect(f.root.textContent).toContain("Cancelada");
  });

  it("cancels the client lifetime and suppresses an old approval result after credentials change", async () => {
    const pending = deferred<FinancialAction>(),
      action = assistantAction();
    const f = setup({ "financialActions.approve": () => pending.promise });
    f.button("Guardar etiqueta").click();
    await vi.waitFor(() => expect(f.calls).toHaveLength(1));
    f.credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    f.fixture.detectChanges();
    pending.resolve({ ...action, status: "applied" });
    await f.render();
    expect(f.calls[0].options?.signal?.aborted).toBe(true);
    expect(f.root.textContent).not.toContain("Cambio confirmado");
  });
});
