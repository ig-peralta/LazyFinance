import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { deferred } from "../../../testing/deferred";
import {
  incomeSource,
  principal,
  type RpcOutput,
  setupRpc,
} from "../../../testing/rpc";
import { SourcesPage } from "./sources.page";

describe("income source management", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("persists a source, edits it and archives it with retained history after reload", async () => {
    let rows: RpcOutput<"income.sources"> = [];
    const mock = setupRpc({
      "income.sources": () => rows,
      "income.createSource": (input) => {
        const row = { ...incomeSource, ...input };
        rows = [row];
        return row;
      },
      "income.updateSource": ({ source }) => {
        const row = { ...incomeSource, ...source };
        rows = [row];
        return row;
      },
      "income.archiveSource": () => {
        const row = { ...rows[0], archivedAt: "2026-11-08T15:00:00.000Z" };
        rows = [row];
        return row;
      },
    });
    const fixture = TestBed.createComponent(SourcesPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const fill = (selector: string, value: string) => {
      const input = root.querySelector<HTMLInputElement>(selector);
      if (!input) throw new Error(selector);
      input.value = value;
      input.dispatchEvent(new Event("input"));
    };
    fill("#source-name", "Trabajo");
    fill("#source-amount", "1234567,89");
    root.querySelector("form")?.dispatchEvent(new Event("submit"));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("income.createSource")[0].input.expectedAmount).toBe(
      "1234567.89",
    );
    fill("#source-name", "Sueldo principal");
    root.querySelector("form")?.dispatchEvent(new Event("submit"));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("income.updateSource")[0].input.source.name).toBe(
      "Sueldo principal",
    );
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Archivar")
      ?.click();
    fixture.detectChanges();
    expect(root.textContent).toContain("no borra cobros");
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Confirmar archivo"))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("income.archiveSource")).toHaveLength(1);
    expect(root.textContent).toContain("Archivada");
    fixture.destroy();
    const revisit = TestBed.createComponent(SourcesPage);
    revisit.detectChanges();
    await revisit.whenStable();
    revisit.detectChanges();
    expect(revisit.nativeElement.textContent).toContain("Sueldo principal");
  });

  it("does not replay a pending create or publish it to the next owner's page", async () => {
    const pending = deferred<RpcOutput<"income.createSource">>();
    const mock = setupRpc({ "income.createSource": () => pending.promise });
    const fixture = TestBed.createComponent(SourcesPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    for (const [id, value] of [
      ["#source-name", "Privada"],
      ["#source-amount", "100"],
    ]) {
      const input = root.querySelector<HTMLInputElement>(id);
      if (!input) throw new Error(id);
      input.value = value;
      input.dispatchEvent(new Event("input"));
    }
    root.querySelector("form")?.dispatchEvent(new Event("submit"));
    root.querySelector("form")?.dispatchEvent(new Event("submit"));
    mock.credentials.accept({ ...principal, userId: "bob" }, "bob");
    pending.resolve(incomeSource);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("income.createSource")).toHaveLength(1);
    expect(root.textContent).not.toContain("Fuente guardada");
    expect(root.querySelector<HTMLInputElement>("#source-name")?.value).toBe(
      "",
    );
  });
});
