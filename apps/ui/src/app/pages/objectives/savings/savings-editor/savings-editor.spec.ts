import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { CreateSavingsGoalSchema } from "@lazyfinance/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../../../testing/deferred";
import { useDialogStub } from "../../../../../testing/dialog";
import { eventsIn } from "../../../../../testing/dom";
import {
  principal,
  type RpcOutput,
  savingsGoal,
  setupRpc,
  tag,
} from "../../../../../testing/rpc";
import { objectiveFields, objectiveInput } from "../../forms/objective-form";
import { SavingsPage } from "../savings.page";
import { SavingsGoalPage } from "../savings-goal.page";
import { SavingsEditor } from "./savings-editor";

describe("owned savings target management", () => {
  useDialogStub();
  afterEach(() => TestBed.resetTestingModule());

  it.each([
    "lifetime",
    "monthly",
    "yearly",
    "fixed",
  ] as const)("supports the %s target schedule without manufacturing progress", (period) => {
    const fields = objectiveFields(savingsGoal);
    fields.period = period;
    fields.start = "2026-01-01";
    fields.end = "2026-12-31";
    const parsed = CreateSavingsGoalSchema.safeParse(objectiveInput(fields));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.schedule.period).toBe(period);
  });

  it("creates an exact, selected-tag lifetime goal and persists the declaration after revisiting", async () => {
    let rows: RpcOutput<"objectives.list"> = [];
    const mock = setupRpc({
      "objectives.list": () => rows,
      "objectives.createSavingsGoal": () => {
        rows = [savingsGoal];
        return savingsGoal;
      },
    });
    const fixture = TestBed.createComponent(SavingsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const event = eventsIn(root);
    expect(root.querySelector("form")).toBeNull();
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Nueva meta"))
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    for (const [id, value] of [
      ["#objective-name", "Fondo"],
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
    fixture.detectChanges();
    expect(mock.callsTo("objectives.createSavingsGoal")[0].input).toEqual({
      name: "Fondo",
      amount: "9007199254740.99",
      tagIds: [tag.id],
      schedule: { period: "lifetime" },
    });
    expect(root.textContent).toContain("Meta guardada");
    expect(root.querySelector("dialog")).toBeNull();
    fixture.destroy();
    const revisit = TestBed.createComponent(SavingsPage);
    revisit.detectChanges();
    await revisit.whenStable();
    revisit.detectChanges();
    expect(revisit.nativeElement.textContent).toContain("Fondo de calma");
  });

  it("uses an expected version for immediate restatement, prevents duplicates and discards obsolete results", async () => {
    const pending = deferred<RpcOutput<"objectives.updateSavingsGoal">>();
    const mock = setupRpc({
      "objectives.updateSavingsGoal": () => pending.promise,
    });
    const fixture = TestBed.createComponent(SavingsEditor);
    fixture.componentRef.setInput("goal", savingsGoal);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const results: string[] = [];
    fixture.componentInstance.saved.subscribe((goal) => results.push(goal.id));
    const root: HTMLElement = fixture.nativeElement;
    const event = eventsIn(root);
    expect(root.textContent).toContain("no difiere el cambio");
    root.querySelector("form")?.dispatchEvent(event("submit"));
    root.querySelector("form")?.dispatchEvent(event("submit"));
    await vi.waitFor(() =>
      expect(mock.callsTo("objectives.updateSavingsGoal")).toHaveLength(1),
    );
    expect(mock.callsTo("objectives.updateSavingsGoal")[0].input).toMatchObject(
      { id: savingsGoal.id, expectedVersion: 1 },
    );
    mock.credentials.accept({ ...principal, userId: "bob" }, "bob");
    pending.resolve({ ...savingsGoal, version: 2 });
    await fixture.whenStable();
    expect(mock.callsTo("objectives.updateSavingsGoal")).toHaveLength(1);
    expect(results).toEqual([]);
  });

  it("retains direct detail and configuration history after version-checked archival", async () => {
    let goal: RpcOutput<"objectives.savingsGoal"> = savingsGoal;
    const mock = setupRpc({
      "objectives.savingsGoal": () => goal,
      "objectives.savingsGoalHistory": () => ({
        items: [
          {
            ...savingsGoal,
            id: savingsGoal.revisionId,
            goalId: savingsGoal.id,
            recordedAt: "2026-11-01T15:00:00.000Z",
          },
        ],
        pageInfo: { hasMore: false, nextCursor: null },
      }),
      "objectives.archiveSavingsGoal": (input) => {
        expect(input.expectedVersion).toBe(1);
        goal = {
          ...savingsGoal,
          version: 2,
          archivedAt: "2026-11-08T15:00:00.000Z",
        };
        return goal;
      },
    });
    mock.navigate.mockRestore();
    TestBed.inject(Router).resetConfig([
      { path: "metas/:id", component: SavingsGoalPage },
    ]);
    const harness = await RouterTestingHarness.create(
      `/metas/${savingsGoal.id}`,
    );
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root: HTMLElement = harness.fixture.nativeElement;
    const historyToggle = root.querySelector<HTMLButtonElement>(
      '[aria-controls="savings-revision-history"]',
    );
    expect(historyToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(
      root.querySelector<HTMLElement>("#savings-revision-history")?.hidden,
    ).toBe(true);
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Ver historial"))
      ?.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(mock.callsTo("objectives.savingsGoalHistory")).toHaveLength(1);
    expect(historyToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(
      root.querySelector<HTMLElement>("#savings-revision-history")?.hidden,
    ).toBe(false);
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Archivar meta"))
      ?.click();
    harness.detectChanges();
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Confirmar archivo"))
      ?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(root.textContent).toContain("Meta archivada");
    expect(root.querySelector("form")).toBeNull();
    expect(
      [...root.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("Ajustar meta"),
      ),
    ).toBe(false);
  });
});
