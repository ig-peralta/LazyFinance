import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { useDialogStub } from "../../../../../testing/dialog";
import { eventsIn } from "../../../../../testing/dom";
import {
  incomeSource,
  type RpcOutput,
  rpcResponse,
  setupRpc,
} from "../../../../../testing/rpc";
import { ExpectationEditor } from "./expectation-editor";
import { Expectations } from "./expectations";

describe("dated income expectations", () => {
  useDialogStub();
  afterEach(() => TestBed.resetTestingModule());

  it("connects field help and flags invalid expectation dates without marking a valid amount", async () => {
    const mock = setupRpc();
    const fixture = TestBed.createComponent(ExpectationEditor);
    fixture.componentRef.setInput("source", {
      ...incomeSource,
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    for (const [id, value] of [
      ["#expectation-date", "2026-12-01"],
      ["#expectation-amount", "123,45"],
    ]) {
      const input = root.querySelector<HTMLInputElement>(id);
      if (!input) throw new Error(id);
      input.value = value;
      input.dispatchEvent(eventsIn(root)("input"));
    }
    root.querySelector("form")?.dispatchEvent(eventsIn(root)("submit"));
    fixture.detectChanges();
    const date = root.querySelector("#expectation-date");
    expect(date?.getAttribute("aria-invalid")).toBe("true");
    expect(
      root.querySelector("#expectation-amount")?.getAttribute("aria-invalid"),
    ).toBe("false");
    expect(
      root.querySelector(`#${date?.getAttribute("aria-describedby")}`)
        ?.textContent,
    ).toContain("2026-11-30");
    expect(mock.callsTo("income.createExpectation")).toHaveLength(0);
  });

  it("creates, edits and removes an estimate without confirming income", async () => {
    let entries: RpcOutput<"income.expectations"> = [];
    const mock = setupRpc({
      "income.expectations": () => entries,
      "income.createExpectation": ({ sourceId, expectation }) => {
        const entry = {
          id: "00000000-0000-4000-8000-000000000051",
          sourceId,
          ...expectation,
          isEstimate: expectation.isEstimate ?? false,
        };
        entries = [entry];
        return entry;
      },
      "income.updateExpectation": ({ expectation }) => {
        const entry = { ...entries[0], ...expectation };
        entries = [entry];
        return entry;
      },
      "income.removeExpectation": () => {
        entries = [];
        return rpcResponse(undefined);
      },
    });
    const fixture = TestBed.createComponent(Expectations);
    fixture.componentRef.setInput("source", {
      ...incomeSource,
      regularity: "irregular",
      schedule: null,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const event = eventsIn(root);
    expect(root.querySelector("form")).toBeNull();
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Nuevo pago esperado"))
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const fill = (id: string, value: string) => {
      const input = root.querySelector<HTMLInputElement>(id);
      if (!input) throw new Error(id);
      input.value = value;
      input.dispatchEvent(event("input"));
    };
    fill("#expectation-date", "2026-11-20");
    fill("#expectation-amount", "100,50");
    root.querySelector<HTMLInputElement>('[type="checkbox"]')?.click();
    root.querySelector("form")?.dispatchEvent(event("submit"));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      mock.callsTo("income.createExpectation")[0].input.expectation,
    ).toEqual({ date: "2026-11-20", amount: "100.50", isEstimate: true });
    expect(root.querySelector("dialog")).toBeNull();
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Editar")
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fill("#expectation-amount", "200");
    root.querySelector("form")?.dispatchEvent(event("submit"));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("income.updateExpectation")).toHaveLength(1);
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Eliminar")
      ?.click();
    fixture.detectChanges();
    expect(root.textContent).toContain("No borra un ingreso recibido.");
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Confirmar eliminación"))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("income.removeExpectation")).toHaveLength(1);
    expect(mock.callsTo("income.confirm")).toHaveLength(0);
    expect(root.textContent).toContain(
      "Pago esperado eliminado. Los ingresos recibidos no se modificaron.",
    );
  });
});
