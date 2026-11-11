import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import { useDialogStub } from "../../../testing/dialog";
import { eventsIn } from "../../../testing/dom";
import { principal, type RpcOutput, setupRpc, tag } from "../../../testing/rpc";
import { TagsPage } from "./tags.page";

describe("owned tag management", () => {
  useDialogStub();
  afterEach(() => TestBed.resetTestingModule());

  it("creates, renames, recolors and archives through explicit commands and reloads persisted results", async () => {
    let tags: RpcOutput<"tags.list"> = [tag];
    const mock = setupRpc({
      "tags.list": () => tags,
      "tags.create": (input) => {
        const created = {
          ...tag,
          id: "00000000-0000-4000-8000-000000000099",
          name: input.name,
          color: input.color ?? null,
        };
        tags = [...tags, created];
        return created;
      },
      "tags.update": (input) => {
        const updated = {
          ...tag,
          name: input.name ?? tag.name,
          color: input.color ?? null,
          isArchived: false,
        };
        tags = [updated, ...tags.slice(1)];
        return updated;
      },
      "tags.archive": ({ id }) => {
        tags = tags.filter((item) => item.id !== id);
        return { ...tag, id, isArchived: true };
      },
    });
    const fixture = TestBed.createComponent(TagsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const event = eventsIn(root);
    expect(root.textContent).not.toContain(tag.color);
    expect(
      root.querySelector<HTMLElement>(".tag-swatch")?.style.backgroundColor,
    ).toBe("rgb(34, 170, 119)");
    expect(root.querySelector("form")).toBeNull();
    expect(root.querySelectorAll(".tag-card")).toHaveLength(1);
    expect(
      root.querySelector('.record-actions [aria-label="Archivar Comida"]'),
    ).not.toBeNull();
    expect(mock.callsTo("tags.archive")).toHaveLength(0);
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Nueva etiqueta"))
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    let input = root.querySelector<HTMLInputElement>("#tag-name");
    if (!input) throw new Error("Missing name field");
    input.value = "Viajes";
    input.dispatchEvent(event("input"));
    root
      .querySelector("form")
      ?.dispatchEvent(event("submit", { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("tags.create")[0].input).toMatchObject({
      name: "Viajes",
      color: "#78966a",
    });
    expect(root.textContent).toContain("Etiqueta creada");
    expect(root.querySelector("dialog")).toBeNull();
    root
      .querySelector<HTMLButtonElement>('[aria-label="Editar Comida"]')
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    input = root.querySelector<HTMLInputElement>("#tag-name");
    if (!input) throw new Error("Missing edit field");
    input.value = "Alimentación";
    input.dispatchEvent(event("input"));
    const color = root.querySelector<HTMLInputElement>("#tag-color");
    if (!color) throw new Error("Missing color");
    color.value = "#112233";
    color.dispatchEvent(event("input"));
    root
      .querySelector("form")
      ?.dispatchEvent(event("submit", { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("tags.update")[0].input).toMatchObject({
      id: tag.id,
      name: "Alimentación",
      color: "#112233",
    });
    root
      .querySelector<HTMLButtonElement>('[aria-label="Archivar Alimentación"]')
      ?.click();
    fixture.detectChanges();
    expect(root.textContent).toContain("el nombre seguirá reservado");
    const archive = [...root.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Sí, archivar"),
    );
    archive?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("tags.archive")).toHaveLength(1);
    expect(root.querySelector('[aria-label="Editar Alimentación"]')).toBeNull();
    fixture.destroy();
    const revisited = TestBed.createComponent(TagsPage);
    revisited.detectChanges();
    await revisited.whenStable();
    revisited.detectChanges();
    expect(revisited.nativeElement.textContent).toContain("Viajes");
  });

  it("uses only validated hex colors for catalog swatches", async () => {
    setupRpc({
      "tags.list": () => [
        { ...tag, color: "url(https://example.invalid/color)" },
      ],
    });
    const fixture = TestBed.createComponent(TagsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(
      root.querySelector<HTMLElement>(".tag-swatch")?.style.backgroundColor,
    ).toBe("rgb(181, 193, 170)");
    expect(root.textContent).not.toContain("Color personalizado");
  });

  it("filters the card collection locally and clears an empty search without writes", async () => {
    const mock = setupRpc({
      "tags.list": () => [tag, { ...tag, id: "second-tag", name: "Viajes" }],
    });
    const fixture = TestBed.createComponent(TagsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const input = root.querySelector<HTMLInputElement>('input[type="search"]');
    if (!input) throw new Error("Missing tag search");
    expect(root.querySelectorAll(".tag-card")).toHaveLength(2);
    input.value = "VIA";
    input.dispatchEvent(eventsIn(root)("input"));
    fixture.detectChanges();
    expect(root.querySelectorAll(".tag-card")).toHaveLength(1);
    expect(root.querySelector(".tag-card h3")?.textContent).toBe("Viajes");
    expect(root.querySelector(".catalog-results")?.textContent).toContain(
      "1 resultado",
    );
    input.value = "No existe";
    input.dispatchEvent(eventsIn(root)("input"));
    fixture.detectChanges();
    expect(root.querySelectorAll(".tag-card")).toHaveLength(0);
    expect(root.querySelector(".catalog-results")?.textContent).toContain(
      "0 resultados",
    );
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Limpiar búsqueda")
      ?.click();
    fixture.detectChanges();
    expect(input.value).toBe("");
    expect(root.querySelectorAll(".tag-card")).toHaveLength(2);
    expect(mock.callsTo("tags.list")).toHaveLength(1);
    expect(mock.callsTo("tags.update")).toHaveLength(0);
    expect(mock.callsTo("tags.archive")).toHaveLength(0);
  });

  it("keeps archive confirmation on the chosen card and cancels without writing", async () => {
    const mock = setupRpc({
      "tags.list": () => [tag, { ...tag, id: "second-tag", name: "Viajes" }],
    });
    const fixture = TestBed.createComponent(TagsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const trigger = root.querySelector<HTMLButtonElement>(
      '[aria-label="Archivar Comida"]',
    );
    if (!trigger) throw new Error("Missing tag archive action");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const confirmation = root.querySelector<HTMLElement>(
      `[id="${trigger.getAttribute("aria-controls")}"]`,
    );
    expect(confirmation?.hidden).toBe(false);
    expect(
      confirmation?.closest(".tag-card")?.querySelector("h3")?.textContent,
    ).toBe("Comida");
    [...(confirmation?.querySelectorAll("button") ?? [])]
      .find((button) => button.textContent?.trim() === "Cancelar")
      ?.click();
    fixture.detectChanges();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(confirmation?.hidden).toBe(true);
    expect(mock.callsTo("tags.archive")).toHaveLength(0);
  });

  it("prevents duplicate writes, cancels obsolete ownership and clears drafts/notices for the next user", async () => {
    const save = deferred<RpcOutput<"tags.create">>();
    const mock = setupRpc({
      "tags.create": () => save.promise,
      "tags.list": (_input, call) =>
        call.authorization === "Bearer bob" ? [] : [tag],
    });
    const fixture = TestBed.createComponent(TagsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const event = eventsIn(root);
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Nueva etiqueta"))
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const input = root.querySelector<HTMLInputElement>("#tag-name");
    if (!input) throw new Error("Missing form");
    input.value = "Privada";
    input.dispatchEvent(event("input"));
    const form = root.querySelector("form");
    form?.dispatchEvent(event("submit", { bubbles: true, cancelable: true }));
    form?.dispatchEvent(event("submit", { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await vi.waitFor(() => expect(mock.callsTo("tags.create")).toHaveLength(1));
    mock.credentials.accept(
      { ...principal, userId: "owner-b", name: "Bob" },
      "bob",
    );
    save.resolve({ ...tag, name: "Privada" });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("tags.create")).toHaveLength(1);
    expect(root.textContent).not.toContain("Comida");
    expect(root.textContent).not.toContain("Etiqueta creada");
    expect(root.querySelector("dialog")).toBeNull();
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Nueva etiqueta"))
      ?.click();
    fixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>("#tag-name")?.value).toBe("");
  });

  it("discards cancelled drafts and ignores a create response after the drawer is closed", async () => {
    const pending = deferred<RpcOutput<"tags.create">>();
    const mock = setupRpc({ "tags.create": () => pending.promise });
    const fixture = TestBed.createComponent(TagsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const event = eventsIn(root);
    const open = async () => {
      [...root.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Nueva etiqueta"))
        ?.click();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    await open();
    const input = root.querySelector<HTMLInputElement>("#tag-name");
    if (!input) throw new Error("Missing tag draft");
    input.value = "Sin confirmar";
    input.dispatchEvent(event("input"));
    root.querySelector("form")?.dispatchEvent(event("submit"));
    await vi.waitFor(() => expect(mock.callsTo("tags.create")).toHaveLength(1));
    root
      .querySelector<HTMLButtonElement>('[aria-label="Cerrar panel"]')
      ?.click();
    fixture.detectChanges();
    expect(mock.callsTo("tags.create")[0].options?.signal?.aborted).toBe(true);
    await open();
    pending.resolve({ ...tag, name: "Sin confirmar" });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>("#tag-name")?.value).toBe("");
    expect(root.querySelector("dialog")).not.toBeNull();
    expect(root.textContent).not.toContain("Etiqueta creada");
  });

  it("retains a rejected draft and reconciles an uncertain create without replay", async () => {
    const mock = setupRpc({
      "tags.create": () => {
        throw new Error("Lost response");
      },
    });
    const fixture = TestBed.createComponent(TagsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const event = eventsIn(root);
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Nueva etiqueta"))
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const input = root.querySelector<HTMLInputElement>("#tag-name");
    if (!input) throw new Error("Missing name");
    input.value = "Borrador";
    input.dispatchEvent(event("input"));
    root.querySelector("form")?.dispatchEvent(event("submit"));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(input.value).toBe("Borrador");
    expect(root.textContent).toContain("El resultado es incierto");
    root.querySelector("form")?.dispatchEvent(event("submit"));
    await fixture.whenStable();
    expect(mock.callsTo("tags.create")).toHaveLength(1);
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Comprobar catálogo"))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).toContain("Catálogo comprobado");
    expect(input.value).toBe("Borrador");
    expect(mock.callsTo("tags.create")).toHaveLength(1);
    expect(mock.callsTo("tags.list").length).toBeGreaterThan(1);
  });

  it("keeps duplicate and invalid names editable without issuing a catalog write", async () => {
    const mock = setupRpc();
    const fixture = TestBed.createComponent(TagsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const event = eventsIn(root);
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Nueva etiqueta"))
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const input = root.querySelector<HTMLInputElement>("#tag-name");
    if (!input) throw new Error("Missing name");
    for (const name of ["   ", tag.name]) {
      input.value = name;
      input.dispatchEvent(event("input"));
      root.querySelector("form")?.dispatchEvent(event("submit"));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(root.querySelector(".field-error")).not.toBeNull();
      expect(input.value).toBe(name);
    }
    expect(mock.callsTo("tags.create")).toHaveLength(0);
    expect(root.querySelector("dialog")).not.toBeNull();
  });
});
