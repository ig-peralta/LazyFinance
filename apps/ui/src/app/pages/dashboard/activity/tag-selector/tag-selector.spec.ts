import { type ComponentFixture, TestBed } from "@angular/core/testing";
import type { RecentTransaction } from "@lazyfinance/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  movement,
  type RpcHandlers,
  type RpcOutput,
  rpcFailure,
  setupRpc,
  tag,
} from "../../../../../testing/rpc";
import { TaggingData } from "../../../../features/tagging/tagging.data";
import { TransactionTagSelector } from "./tag-selector";

const suggestion = {
  ruleId: "rule",
  tagId: tag.id,
  tagName: tag.name,
  confidence: "high",
  reason: "merchant_exact",
  autoApply: false,
} satisfies RpcOutput<"tags.suggestions">[number];

function setup(
  transaction: RecentTransaction = movement,
  handlers: RpcHandlers = {},
) {
  const rpc = setupRpc(handlers);
  const fixture = TestBed.createComponent(TransactionTagSelector);
  fixture.componentRef.setInput("transaction", transaction);
  fixture.detectChanges();

  return { ...rpc, fixture, tagging: TestBed.inject(TaggingData) };
}

async function open(fixture: ComponentFixture<TransactionTagSelector>) {
  fixture.nativeElement.querySelector('button[aria-haspopup="dialog"]').click();
  await fixture.whenStable();
  fixture.detectChanges();
}

function button(
  fixture: ComponentFixture<TransactionTagSelector>,
  label: string,
) {
  return (
    Array.from(
      fixture.nativeElement.querySelectorAll("button"),
    ) as HTMLButtonElement[]
  ).find((item) => item.textContent?.includes(label))!;
}

describe("TransactionTagSelector presentation and command state", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("applies a suggestion without opening or loading the catalog", async () => {
    const { fixture, callsTo, tagging } = setup(movement, {
      "tags.suggestions": () => [suggestion],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('button[aria-label="Usar sugerencia Comida"]')
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(callsTo("tags.decide")[0].input).toEqual({
      transactionId: movement.id,
      tagId: tag.id,
    });
    expect(tagging.changed()?.selection).toEqual({
      transactionId: movement.id,
      tag: { ...tag, color: null },
      origin: "manual",
    });
    expect(callsTo("tags.list")).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it("supports manual no-tag and reset decisions", async () => {
    const { fixture, tagging, callsTo } = setup();
    await open(fixture);
    button(fixture, "Dejar sin etiqueta").click();
    await fixture.whenStable();
    expect(tagging.changed()?.selection).toMatchObject({
      transactionId: movement.id,
      tag: null,
      origin: "manual",
    });
    fixture.componentRef.setInput("transaction", {
      ...movement,
      tagDecisionOrigin: "manual",
    });
    fixture.detectChanges();
    await open(fixture);
    button(fixture, "Marcar sin revisar").click();
    await fixture.whenStable();
    expect(callsTo("tags.reset")[0].input).toEqual({ id: movement.id });
    expect(tagging.changed()?.selection.origin).toBe("unreviewed");
  });

  it("creates a tag and assigns it without exposing transport details to the view", async () => {
    const { fixture, tagging, callsTo } = setup(movement, {
      "tags.list": () => [],
    });
    await open(fixture);
    const search = fixture.nativeElement.querySelector(
      'input[type="search"]',
    ) as HTMLInputElement;
    search.value = "Nuevo gasto";
    search.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    button(fixture, "Crear «Nuevo gasto» y usar").click();
    await fixture.whenStable();
    expect(callsTo("tags.create")[0].input).toEqual({ name: "Nuevo gasto" });
    expect(callsTo("tags.decide")).toHaveLength(1);
    expect(tagging.changed()?.selection.tag?.name).toBe("Nuevo gasto");
  });

  it("only creates an automatic rule with explicit approval, preserving partial success", async () => {
    const { fixture, tagging, callsTo } = setup(
      { ...movement, tag, tagDecisionOrigin: "manual" },
      {
        "tagRules.create": () => rpcFailure(),
      },
    );
    await open(fixture);
    const remember = fixture.nativeElement.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    remember.checked = true;
    remember.dispatchEvent(new Event("change"));
    fixture.detectChanges();
    button(fixture, "Activar con Comida").click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(callsTo("tagRules.create")[0].input).toEqual({
      tagId: tag.id,
      accountId: movement.account.id,
      direction: "debit",
      matchField: "merchant",
      matchValue: movement.merchant,
      priority: 0,
      autoApply: true,
    });
    expect(callsTo("tags.decide")).toHaveLength(1);
    expect(callsTo("tagRules.create")).toHaveLength(1);
    expect(tagging.changed()?.selection.tag).toEqual(tag);
    expect(fixture.nativeElement.textContent).toContain(
      "La etiqueta se guardó, pero no pudimos crear la regla automática.",
    );
    expect(
      fixture.nativeElement.querySelector('[role="dialog"]'),
    ).not.toBeNull();
  });

  it("preserves the suggestion when assigning fails and never retries an ambiguous mutation", async () => {
    const { fixture, tagging, callsTo } = setup(movement, {
      "tags.suggestions": () => [suggestion],
      "tags.decide": () => {
        throw new TypeError("Connection closed after write");
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();
    button(fixture, "Sugerencia: Comida").click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tagging.changed()).toBeUndefined();
    expect(callsTo("tags.decide")).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain(
      "No pudimos actualizar la etiqueta",
    );
    expect(button(fixture, "Sugerencia: Comida")).toBeDefined();
  });

  it("keeps the picker positioned below its trigger and closes with Escape", async () => {
    const { fixture } = setup();
    const scrollBy = vi
      .spyOn(window, "scrollBy")
      .mockImplementation(() => undefined);
    fixture.nativeElement
      .querySelector('button[aria-haspopup="dialog"]')
      .click();
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector(
      '[role="dialog"]',
    ) as HTMLElement;
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      bottom: window.innerHeight + 80,
    } as DOMRect);
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(scrollBy).toHaveBeenCalledWith({ top: 92, behavior: "smooth" }),
    );
    expect(panel.classList.contains("top-full")).toBe(true);
    expect(panel.querySelectorAll(".overflow-y-auto")).toHaveLength(1);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    scrollBy.mockRestore();
  });
});
