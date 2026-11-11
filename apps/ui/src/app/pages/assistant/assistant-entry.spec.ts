import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { emptySummary, setupRpc } from "../../../testing/rpc";
import { AssistantEntry } from "./assistant-entry";

describe("assistant-first home without an AI dependency", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("loads ordinary financial totals without reading consent, creating chat or invoking a model", async () => {
    const f = setupRpc(
      {
        "summaries.monthly": ({ month }) => ({
          ...emptySummary,
          month: month ?? emptySummary.month,
          spending: "200000.00",
          receivedIncome: "500000.00",
        }),
      },
      "browser",
      true,
    );
    const fixture = TestBed.createComponent(AssistantEntry);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector<HTMLDetailsElement>(".home-overview")?.open).toBe(
      false,
    );
    expect(root.querySelector("h1")).toBeNull();
    expect(root.querySelectorAll(".financial-snapshot a")).toHaveLength(3);
    expect(root.textContent).toContain("$200.000");
    expect(root.textContent).toContain("no es dinero disponible");
    expect(root.querySelector('a[href="/dashboard"]')?.textContent).toContain(
      "Resumen completo",
    );
    expect(f.callsTo("assistant.configuration")).toHaveLength(0);
    expect(f.callsTo("assistant.createConversation")).toHaveLength(0);
    expect(f.callsTo("assistant.consent")).toHaveLength(0);
  });

  it("closes the optional monthly details on Escape or an outside pointer without a new read", async () => {
    const f = setupRpc(
      { "summaries.monthly": () => emptySummary },
      "browser",
      true,
    );
    const fixture = TestBed.createComponent(AssistantEntry);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    document.body.append(root);
    try {
      const details = root.querySelector<HTMLDetailsElement>(".home-overview");
      const summary = details?.querySelector("summary");
      if (!details || !summary) throw new Error("Missing monthly overview");
      details.open = true;
      summary.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(details.open).toBe(false);
      expect(document.activeElement).toBe(summary);
      details.open = true;
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      expect(details.open).toBe(false);
      expect(f.callsTo("summaries.monthly")).toHaveLength(1);
      expect(f.callsTo("assistant.createConversation")).toHaveLength(0);
    } finally {
      root.remove();
    }
  });

  it("changes the snapshot month through a normal scoped summary read", async () => {
    const f = setupRpc(
      {
        "summaries.monthly": ({ month }) => ({
          ...emptySummary,
          month: month ?? emptySummary.month,
        }),
      },
      "browser",
      true,
    );
    const fixture = TestBed.createComponent(AssistantEntry);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const picker = (fixture.nativeElement as HTMLElement).querySelector(
      "input",
    );
    if (!picker) throw new Error("Missing month picker");
    picker.value = "2026-01";
    picker.dispatchEvent(new Event("change"));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(f.callsTo("summaries.monthly").at(-1)?.input).toEqual({
      month: "2026-01",
    });
    expect(f.callsTo("assistant.createConversation")).toHaveLength(0);
  });
});
