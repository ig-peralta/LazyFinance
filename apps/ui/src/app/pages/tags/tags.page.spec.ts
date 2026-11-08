import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { deferred } from "../../../testing/deferred";
import { eventsIn } from "../../../testing/dom";
import { principal, type RpcOutput, setupRpc, tag } from "../../../testing/rpc";
import { TagsPage } from "./tags.page";

describe("owned tag management", () => {
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
    const input = root.querySelector<HTMLInputElement>("#tag-name");
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
    root
      .querySelector<HTMLButtonElement>('[aria-label="Editar Comida"]')
      ?.click();
    fixture.detectChanges();
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
    const input = root.querySelector<HTMLInputElement>("#tag-name");
    if (!input) throw new Error("Missing form");
    input.value = "Privada";
    input.dispatchEvent(event("input"));
    const form = root.querySelector("form");
    form?.dispatchEvent(event("submit", { bubbles: true, cancelable: true }));
    form?.dispatchEvent(event("submit", { bubbles: true, cancelable: true }));
    fixture.detectChanges();
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
    expect(input.value).toBe("");
  });
});
