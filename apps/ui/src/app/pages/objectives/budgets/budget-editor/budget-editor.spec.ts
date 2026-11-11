import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { afterEach, describe, expect, it } from "vitest";
import { useDialogStub } from "../../../../../testing/dialog";
import { eventsIn } from "../../../../../testing/dom";
import {
  budgetDetail,
  budgetRevision,
  principal,
  type RpcOutput,
  rpcFailure,
  setupRpc,
  tag,
} from "../../../../../testing/rpc";
import { objectiveFields, objectiveInput } from "../../forms/objective-form";
import { BudgetPage } from "../budget.page";
import { BudgetEditor } from "./budget-editor";

describe("revision-aware spending budgets", () => {
  useDialogStub();
  afterEach(() => TestBed.resetTestingModule());

  it("creates a selected-tag budget with exact money and supported calendar dates", async () => {
    const mock = setupRpc({ "objectives.createBudget": () => budgetDetail });
    const fixture = TestBed.createComponent(BudgetEditor);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const event = eventsIn(root);
    for (const [id, value] of [
      ["#objective-name", "Hogar"],
      ["#objective-amount", "9007199254740,99"],
    ]) {
      const field = root.querySelector<HTMLInputElement>(id);
      if (!field) throw new Error(id);
      field.value = value;
      field.dispatchEvent(event("input"));
    }
    root.querySelector<HTMLInputElement>('[type="checkbox"]')?.click();
    root.querySelector("form")?.dispatchEvent(event("submit"));
    await fixture.whenStable();
    expect(mock.callsTo("objectives.createBudget")[0].input).toMatchObject({
      name: "Hogar",
      amount: "9007199254740.99",
      tagIds: [tag.id],
      schedule: { period: "monthly" },
    });
  });

  it("associates field help and validation feedback without changing exact input", async () => {
    const mock = setupRpc();
    const fixture = TestBed.createComponent(BudgetEditor);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const amount = root.querySelector<HTMLInputElement>("#objective-amount");
    expect(amount?.getAttribute("aria-describedby")).toBe(
      "objective-amount-help",
    );
    root.querySelector("form")?.dispatchEvent(eventsIn(root)("submit"));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(amount?.getAttribute("aria-describedby")).toBe(
      "objective-amount-help objective-error",
    );
    expect(root.querySelector("#objective-error")?.textContent).toContain(
      "Revisa nombre",
    );
    expect(
      root.querySelector("#objective-start")?.getAttribute("aria-describedby"),
    ).toBe("objective-start-help objective-error");
    expect(mock.callsTo("objectives.createBudget")).toHaveLength(0);
  });

  it("sends the expected version without a started schedule and makes started fixed budgets read-only", async () => {
    const mock = setupRpc({
      "objectives.updateBudget": () => ({ ...budgetDetail, version: 2 }),
    });
    const fixture = TestBed.createComponent(BudgetEditor);
    fixture.componentRef.setInput("detail", budgetDetail);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const event = eventsIn(root);
    expect(root.textContent).toContain("próximo mes o año");
    expect(
      root.querySelector<HTMLSelectElement>("#objective-period")?.disabled,
    ).toBe(true);
    root.querySelector("form")?.dispatchEvent(event("submit"));
    await fixture.whenStable();
    expect(mock.callsTo("objectives.updateBudget")[0].input).toEqual({
      id: budgetDetail.id,
      expectedVersion: 1,
      budget: {
        name: budgetRevision.name,
        amount: budgetRevision.amount,
        tagIds: [tag.id],
      },
    });
    fixture.componentRef.setInput("detail", {
      ...budgetDetail,
      effective: {
        ...budgetRevision,
        isRecurring: false,
        period: null,
        endDate: "2020-02-01T03:00:00.000Z",
      },
    });
    fixture.detectChanges();
    expect(root.querySelector("fieldset")?.disabled).toBe(true);
    expect(root.textContent).toContain(
      "fechas fijas ya iniciado no se puede editar",
    );
    const fields = objectiveFields({
      ...budgetRevision,
      id: budgetDetail.id,
      isRecurring: false,
      period: null,
      endDate: "2020-02-01T03:00:00.000Z",
    });
    expect(objectiveInput(fields).schedule).toEqual({
      period: "fixed",
      startDate: "2020-01-01",
      endDate: "2020-01-31",
    });
  });

  it("loads owned versions/history, rejects conflicts without replay and archives with the current write version", async () => {
    let detail: RpcOutput<"objectives.budget"> = budgetDetail;
    const mock = setupRpc({
      "objectives.budget": () => detail,
      "objectives.budgetHistory": () => ({
        items: [budgetRevision],
        pageInfo: { hasMore: false, nextCursor: null },
      }),
      "objectives.updateBudget": () => rpcFailure("CONFLICT", 409),
      "objectives.archiveBudget": ({ expectedVersion }) => {
        expect(expectedVersion).toBe(1);
        detail = {
          ...budgetDetail,
          version: 2,
          archivedAt: "2026-11-08T15:00:00.000Z",
        };
        return detail;
      },
    });
    mock.navigate.mockRestore();
    TestBed.inject(Router).resetConfig([
      { path: "presupuestos/:id", component: BudgetPage },
    ]);
    const harness = await RouterTestingHarness.create(
      `/presupuestos/${budgetDetail.id}`,
    );
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root: HTMLElement = harness.fixture.nativeElement;
    const event = eventsIn(root);
    const historyToggle = root.querySelector<HTMLButtonElement>(
      '[aria-controls="budget-revision-history"]',
    );
    expect(historyToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(
      root.querySelector<HTMLElement>("#budget-revision-history")?.hidden,
    ).toBe(true);
    expect(root.querySelector("form")).toBeNull();
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Ajustar presupuesto"))
      ?.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    root.querySelector("form")?.dispatchEvent(event("submit"));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(mock.callsTo("objectives.updateBudget")).toHaveLength(1);
    expect(root.textContent).toContain("El registro cambió");
    expect(root.querySelector("dialog")).not.toBeNull();
    root
      .querySelector<HTMLButtonElement>('[aria-label="Cerrar panel"]')
      ?.click();
    harness.detectChanges();
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Ver historial"))
      ?.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(mock.callsTo("objectives.budgetHistory")).toHaveLength(1);
    expect(historyToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(
      root.querySelector<HTMLElement>("#budget-revision-history")?.hidden,
    ).toBe(false);
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Archivar presupuesto"))
      ?.click();
    harness.detectChanges();
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Confirmar archivo"))
      ?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(root.textContent).toContain("Presupuesto archivado");
    mock.credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(root.textContent).not.toContain("Presupuesto archivado.");
  });

  it("explains the started fixed lock before offering an editor", async () => {
    const mock = setupRpc({
      "objectives.budget": () => ({
        ...budgetDetail,
        effective: {
          ...budgetRevision,
          isRecurring: false,
          period: null,
          endDate: "2020-02-01T03:00:00.000Z",
        },
      }),
    });
    mock.navigate.mockRestore();
    TestBed.inject(Router).resetConfig([
      { path: "presupuestos/:id", component: BudgetPage },
    ]);
    const harness = await RouterTestingHarness.create(
      `/presupuestos/${budgetDetail.id}`,
    );
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root: HTMLElement = harness.fixture.nativeElement;
    expect(root.textContent).toContain(
      "fechas fijas ya iniciado no se puede editar",
    );
    expect(
      [...root.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("Ajustar presupuesto"),
      ),
    ).toBe(false);
    expect(root.querySelector("budget-editor")).toBeNull();
    expect(root.textContent).toContain("Archivar presupuesto");
    expect(mock.callsTo("objectives.updateBudget")).toHaveLength(0);
  });
});
