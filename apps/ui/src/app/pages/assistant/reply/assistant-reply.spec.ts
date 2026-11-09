import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantReply, assistantSource } from "../../../../testing/assistant";
import { AssistantReply } from "./assistant-reply";

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(AssistantReply);
  fixture.componentRef.setInput("turn", assistantReply);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe("conversational replies with separate financial reference cards", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it("replaces technical codes and raw JSON with formatted account data and a section link for saved replies", () => {
    const f = setup();
    expect(f.root.querySelector("assistant-markdown")?.textContent).toContain(
      "Tu saldo reportado es $500.000.",
    );
    expect(f.root.textContent).not.toContain("F1");
    expect(f.root.textContent).not.toContain("lastSyncedAt");
    expect(f.root.querySelector("pre")).toBeNull();
    const card = f.root.querySelector("assistant-reference");
    expect(card?.textContent).toContain("Cuenta principal");
    expect(card?.textContent).toContain("$500.000");
    expect(card?.textContent).toContain("Sin información de actualización");
    expect(card?.querySelector('a[href="/cuentas"]')?.textContent).toContain(
      "Ver cuentas",
    );
  });

  it("copies the same clean prose instead of reintroducing hidden citation codes", async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    try {
      const f = setup();
      const copy = [...f.root.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Copiar respuesta",
      );
      if (!copy) throw new Error("Missing copy action");
      copy.click();
      await f.fixture.whenStable();
      expect(writeText).toHaveBeenCalledExactlyOnceWith(
        "Tu saldo reportado es **$500.000**.",
      );
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("keeps untrusted reference labels inert, handles unavailable evidence honestly and retains the original internal destination", () => {
    const f = setup();
    f.fixture.componentRef.setInput("turn", {
      ...assistantReply,
      sources: [
        assistantSource({
          title: '<img src="https://evil.test/pixel">',
          status: "unavailable",
          data: null,
        }),
      ],
    });
    f.fixture.detectChanges();
    expect(f.root.querySelector("img")).toBeNull();
    expect(f.root.textContent).toContain("No disponible");
    expect(f.root.textContent).toContain(
      "No significa que los importes sean cero",
    );
    expect(f.root.querySelector('a[href="/cuentas"]')).not.toBeNull();
    expect(f.root.querySelector('a[href^="https:"]')).toBeNull();
  });

  it("does not show partial citation tokens while the reply streams", () => {
    const f = setup();
    for (const suffix of ["[", "[F", "[F1", "[F1]"]) {
      f.fixture.componentRef.setInput("turn", {
        ...assistantReply,
        status: "pending",
        text: `Saldo consultado ${suffix}`,
      });
      f.fixture.detectChanges();
      expect(
        f.root.querySelector("assistant-markdown")?.textContent?.trim(),
      ).toBe("Saldo consultado");
    }
  });
});
