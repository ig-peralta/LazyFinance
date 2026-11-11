import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../../testing/deferred";
import { useDialogStub } from "../../../../testing/dialog";
import { eventsIn } from "../../../../testing/dom";
import {
  incomeSource,
  principal,
  type RpcOutput,
  setupRpc,
} from "../../../../testing/rpc";
import { SourceEditor } from "./source-editor/source-editor";
import { SourcesPage } from "./sources.page";

describe("income source management", () => {
  useDialogStub();
  afterEach(() => TestBed.resetTestingModule());

  it("associates source help and invalid state with the fields that failed validation", async () => {
    const mock = setupRpc();
    const fixture = TestBed.createComponent(SourceEditor);
    fixture.componentRef.setInput("source", incomeSource);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const amount = root.querySelector<HTMLInputElement>("#source-amount");
    if (!amount) throw new Error("Missing amount");
    amount.value = "-1";
    amount.dispatchEvent(eventsIn(root)("input"));
    root.querySelector("form")?.dispatchEvent(eventsIn(root)("submit"));
    fixture.detectChanges();
    expect(amount.getAttribute("aria-invalid")).toBe("true");
    expect(
      root.querySelector("#source-name")?.getAttribute("aria-invalid"),
    ).toBe("false");
    expect(
      root.querySelector(`#${amount.getAttribute("aria-describedby")}`)
        ?.textContent,
    ).toContain("Hasta 2 decimales");
    expect(mock.callsTo("income.updateSource")).toHaveLength(0);
  });

  it("offers only a fixed onboarding return and reacts when that context is removed", async () => {
    setupRpc();
    const query = new BehaviorSubject(
      convertToParamMap({ from: "onboarding" }),
    );
    Object.defineProperty(TestBed.inject(ActivatedRoute), "queryParamMap", {
      value: query,
    });
    const fixture = TestBed.createComponent(SourcesPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const link = root.querySelector("a.workflow-return");
    expect(link?.textContent).toBe("Volver a primeros pasos");
    expect(link?.getAttribute("href")).toBe("/comenzar");
    expect(root.querySelector("nav.section-tabs")).toBeNull();
    query.next(convertToParamMap({ from: "https://example.com" }));
    fixture.detectChanges();
    expect(root.querySelector("a.workflow-return")).toBeNull();
  });

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
    const event = eventsIn(root);
    expect(root.querySelector("form")).toBeNull();
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Nueva fuente"))
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const fill = (selector: string, value: string) => {
      const input = root.querySelector<HTMLInputElement>(selector);
      if (!input) throw new Error(selector);
      input.value = value;
      input.dispatchEvent(event("input"));
    };
    fill("#source-name", "Trabajo");
    fill("#source-amount", "1234567,89");
    root.querySelector("form")?.dispatchEvent(event("submit"));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("income.createSource")[0].input.expectedAmount).toBe(
      "1234567.89",
    );
    expect(root.querySelector("dialog")).toBeNull();
    expect(root.textContent).toContain(
      "Fuente guardada. Los ingresos recibidos no se modificaron.",
    );
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Editar fuente"))
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fill("#source-name", "Sueldo principal");
    root.querySelector("form")?.dispatchEvent(event("submit"));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("income.updateSource")[0].input.source.name).toBe(
      "Sueldo principal",
    );
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Archivar")
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.textContent).toContain("no borra ingresos recibidos");
    const confirmation = [...root.querySelectorAll("li")].find((row) =>
      row.textContent?.includes("¿Archivar Sueldo principal?"),
    );
    expect(confirmation).toBeDefined();
    expect(confirmation?.querySelector("h3")?.textContent).toBe(
      "Sueldo principal",
    );
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Confirmar archivo"))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("income.archiveSource")).toHaveLength(1);
    expect(root.textContent).toContain("Archivada");
    expect(root.textContent).toContain(
      "Fuente archivada. Los ingresos recibidos y el historial anterior se conservan.",
    );
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
    const event = eventsIn(root);
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Nueva fuente"))
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    for (const [id, value] of [
      ["#source-name", "Privada"],
      ["#source-amount", "100"],
    ]) {
      const input = root.querySelector<HTMLInputElement>(id);
      if (!input) throw new Error(id);
      input.value = value;
      input.dispatchEvent(event("input"));
    }
    root.querySelector("form")?.dispatchEvent(event("submit"));
    root.querySelector("form")?.dispatchEvent(event("submit"));
    await vi.waitFor(() =>
      expect(mock.callsTo("income.createSource")).toHaveLength(1),
    );
    mock.credentials.accept({ ...principal, userId: "bob" }, "bob");
    pending.resolve(incomeSource);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("income.createSource")).toHaveLength(1);
    expect(root.textContent).not.toContain("Fuente guardada");
    expect(root.querySelector("dialog")).toBeNull();
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Nueva fuente"))
      ?.click();
    fixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>("#source-name")?.value).toBe(
      "",
    );
  });

  it("keeps irregular planning separate from source editing without nested drawers", async () => {
    const mock = setupRpc({
      "income.sources": () => [
        { ...incomeSource, regularity: "irregular", schedule: null },
      ],
      "income.expectations": () => [],
    });
    const fixture = TestBed.createComponent(SourcesPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const click = async (label: string) => {
      [...root.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === label)
        ?.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    expect(mock.callsTo("income.expectations")).toHaveLength(0);
    await click("Planificar pagos");
    expect(
      [...root.querySelectorAll("button")]
        .find((button) =>
          button.textContent?.includes("Ocultar pagos esperados"),
        )
        ?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(mock.callsTo("income.expectations")).toHaveLength(1);
    expect(root.querySelector("form")).toBeNull();
    await click("Nuevo pago esperado");
    expect(root.querySelectorAll("dialog")).toHaveLength(1);
    expect(root.querySelector("#expectation-date")).not.toBeNull();
    expect(root.querySelector("#source-name")).toBeNull();
    await click("Cancelar");
    await click("Editar fuente");
    expect(root.querySelectorAll("dialog")).toHaveLength(1);
    expect(root.querySelector("#source-name")).not.toBeNull();
    expect(root.querySelector("#expectation-date")).toBeNull();
    await click("Cancelar");
    expect(root.querySelector("dialog")).toBeNull();
    expect(root.textContent).toContain("Pagos puntuales esperados");
  });

  it("groups named edit and archive actions together and keeps confirmation explicit", async () => {
    const mock = setupRpc({
      "income.sources": () => [
        incomeSource,
        {
          ...incomeSource,
          id: "archived-source",
          name: "Fuente anterior",
          archivedAt: "2026-11-08T15:00:00.000Z",
        },
      ],
    });
    const fixture = TestBed.createComponent(SourcesPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const actions = root.querySelector(".record-actions");
    expect(actions?.querySelector("button")?.getAttribute("aria-label")).toBe(
      `Editar fuente ${incomeSource.name}`,
    );
    const archive = actions?.querySelector<HTMLButtonElement>(
      `[aria-label="Archivar ${incomeSource.name}"]`,
    );
    if (!archive) throw new Error("Missing source archive action");
    expect(
      root.querySelector('[aria-label="Archivar Fuente anterior"]'),
    ).toBeNull();
    expect(
      root.querySelector('[aria-label="Ver declaración de Fuente anterior"]'),
    ).not.toBeNull();
    archive.click();
    fixture.detectChanges();
    expect(archive.getAttribute("aria-expanded")).toBe("true");
    const confirmation = actions?.querySelector<HTMLElement>(
      ".record-action-confirmation",
    );
    expect(confirmation?.hidden).toBe(false);
    expect(mock.callsTo("income.archiveSource")).toHaveLength(0);
    [...(confirmation?.querySelectorAll("button") ?? [])]
      .find((button) => button.textContent?.trim() === "Cancelar")
      ?.click();
    fixture.detectChanges();
    expect(confirmation?.hidden).toBe(true);
    expect(archive.getAttribute("aria-expanded")).toBe("false");
    expect(mock.callsTo("income.archiveSource")).toHaveLength(0);
  });
});
