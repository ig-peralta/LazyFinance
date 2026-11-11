import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceAppearance } from "./workspace-appearance";
import { WorkspacePreferences } from "./workspace-preferences";

describe("workspace appearance menu", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  function setup() {
    const fixture = TestBed.createComponent(WorkspaceAppearance);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const panel = root.querySelector("details");
    const trigger = root.querySelector("summary");
    if (!panel || !trigger) throw new Error("Missing appearance controls");
    panel.open = true;
    return { fixture, root, panel, trigger };
  }

  it("keeps the menu open while choosing theme and text size", () => {
    const f = setup();
    const choose = (label: string) =>
      [...f.root.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === label)
        ?.click();
    choose("Oscuro");
    choose("Muy grande");
    f.fixture.detectChanges();
    expect(TestBed.inject(WorkspacePreferences).value()).toMatchObject({
      theme: "dark",
      textSize: "largest",
    });
    expect(f.panel.open).toBe(true);
  });

  it("dismisses with Escape or the named close control and returns focus", () => {
    const f = setup();
    document.body.append(f.root);
    try {
      f.root.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(f.panel.open).toBe(false);
      expect(document.activeElement).toBe(f.trigger);
      f.panel.open = true;
      f.root
        .querySelector<HTMLButtonElement>('[aria-label="Cerrar apariencia"]')
        ?.click();
      expect(f.panel.open).toBe(false);
      expect(document.activeElement).toBe(f.trigger);
    } finally {
      f.root.remove();
    }
  });

  it("closes on an outside pointer without stealing focus from the destination", () => {
    const f = setup();
    const destination = document.createElement("button");
    document.body.append(destination);
    try {
      destination.focus();
      destination.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      expect(f.panel.open).toBe(false);
      expect(document.activeElement).toBe(destination);
    } finally {
      destination.remove();
    }
  });

  it("closes on keyboard departure without moving focus back into the menu", () => {
    const f = setup();
    const destination = document.createElement("button");
    document.body.append(destination);
    try {
      destination.focus();
      f.root.dispatchEvent(
        new FocusEvent("focusout", {
          bubbles: true,
          relatedTarget: destination,
        }),
      );
      expect(f.panel.open).toBe(false);
      expect(document.activeElement).toBe(destination);
    } finally {
      destination.remove();
    }
  });
});
