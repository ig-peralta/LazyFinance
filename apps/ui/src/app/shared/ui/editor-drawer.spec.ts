import "@angular/compiler";
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDialogStub } from "../../../testing/dialog";
import { eventsIn } from "../../../testing/dom";
import { EditorDrawer } from "./editor-drawer";

@Component({
  imports: [EditorDrawer],
  template: `@if (open()) { <editor-drawer title="Nueva etiqueta" (dismissed)="open.set(false)"><input aria-label="Nombre" /></editor-drawer> }`,
})
class DrawerHost {
  readonly open = signal(true);
}

describe("shared editor drawer", () => {
  useDialogStub();
  afterEach(() => TestBed.resetTestingModule());

  async function setup() {
    const fixture = TestBed.createComponent(DrawerHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const dialog = root.querySelector<HTMLDialogElement>("dialog");
    if (!dialog) throw new Error("Missing modal panel");
    return { fixture, root, dialog };
  }

  it("opens a labelled native modal and closes it when dismissed", async () => {
    const { fixture, root, dialog } = await setup();
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute("aria-label")).toBe("Nueva etiqueta");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const close = vi.spyOn(dialog, "close");
    root
      .querySelector<HTMLButtonElement>('[aria-label="Cerrar panel"]')
      ?.click();
    fixture.detectChanges();
    expect(close).toHaveBeenCalledOnce();
    expect(root.querySelector("dialog")).toBeNull();
    expect(root.querySelector("input")).toBeNull();
  });

  it("routes native Escape cancellation through the owner and destroys the content", async () => {
    const { fixture, root, dialog } = await setup();
    const event = eventsIn(root)("cancel", { cancelable: true });
    dialog.dispatchEvent(event);
    fixture.detectChanges();
    expect(event.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.open()).toBe(false);
    expect(dialog.open).toBe(false);
  });

  it("wraps keyboard focus at both ends instead of tabbing into browser chrome", async () => {
    const { root, dialog } = await setup();
    const first = root.querySelector<HTMLButtonElement>("button"),
      last = root.querySelector<HTMLInputElement>("input");
    if (!first || !last) throw new Error("Missing focus stops");
    for (const element of [first, last]) {
      Object.defineProperty(element, "getClientRects", {
        value: () => [element.getBoundingClientRect()],
      });
    }
    const tab = (shiftKey: boolean) => {
      const event = eventsIn(root)("keydown", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperties(event, {
        key: { value: "Tab" },
        shiftKey: { value: shiftKey },
      });
      dialog.dispatchEvent(event);
      return event;
    };
    first.focus();
    expect(tab(true).defaultPrevented).toBe(true);
    expect(root.ownerDocument.activeElement).toBe(last);
    expect(tab(false).defaultPrevented).toBe(true);
    expect(root.ownerDocument.activeElement).toBe(first);
  });

  it("dismisses only a backdrop press and release, not content clicks or drags", async () => {
    const { fixture, root, dialog } = await setup();
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      x: 600,
      y: 0,
      left: 600,
      right: 1200,
      top: 0,
      bottom: 800,
      width: 600,
      height: 800,
      toJSON: () => ({}),
    });
    const mouse = (type: string, x: number) => {
      const event = eventsIn(root)(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        clientX: { value: x },
        clientY: { value: 200 },
      });
      dialog.dispatchEvent(event);
    };
    mouse("pointerdown", 700);
    mouse("click", 700);
    expect(fixture.componentInstance.open()).toBe(true);
    mouse("pointerdown", 700);
    mouse("click", 100);
    expect(fixture.componentInstance.open()).toBe(true);
    mouse("pointerdown", 100);
    mouse("click", 100);
    fixture.detectChanges();
    expect(fixture.componentInstance.open()).toBe(false);
  });
});
