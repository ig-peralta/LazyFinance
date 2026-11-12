import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import {
  assistantAction,
  assistantReply,
  assistantSource,
} from "../../../../testing/assistant";
import { setupRpc } from "../../../../testing/rpc";
import { AssistantCanvas } from "./assistant-canvas";

describe("on-demand assistant query details", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("excludes proposal-only replies and approval controls from text query details", () => {
    setupRpc();
    const fixture = TestBed.createComponent(AssistantCanvas);
    const proposal = {
      ...assistantReply,
      id: "00000000-0000-4000-8000-000000000009",
      sources: [],
      actions: [assistantAction()],
    };
    fixture.componentRef.setInput("turns", [assistantReply, proposal]);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector("assistant-reference")).not.toBeNull();
    expect(root.querySelector("assistant-action-card")).toBeNull();
    expect(root.querySelector("select")).toBeNull();

    fixture.componentRef.setInput("showActions", true);
    fixture.componentRef.setInput("voiceMode", true);
    fixture.componentRef.setInput("selection", proposal.id);
    fixture.detectChanges();
    expect(root.querySelector("assistant-action-card")).not.toBeNull();
    expect(root.querySelector("select")?.value).toBe(proposal.id);
  });

  it("keeps the selector aligned with a newly arrived native voice proposal", () => {
    setupRpc();
    const fixture = TestBed.createComponent(AssistantCanvas);
    fixture.componentRef.setInput("turns", [assistantReply]);
    fixture.componentRef.setInput("showActions", true);
    fixture.componentRef.setInput("voiceMode", true);
    fixture.detectChanges();
    const proposal = {
      ...assistantReply,
      id: "00000000-0000-4000-8000-000000000009",
      sources: [],
      actions: [assistantAction()],
    };
    fixture.componentRef.setInput("turns", [assistantReply, proposal]);
    fixture.componentRef.setInput("selection", proposal.id);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector("select")?.value).toBe(proposal.id);
    expect(root.querySelector("assistant-action-card")).not.toBeNull();
  });

  it("selects only the requested server-owned source or proposal card", () => {
    setupRpc();
    const fixture = TestBed.createComponent(AssistantCanvas);
    const first = assistantAction();
    const second = assistantAction({
      id: "00000000-0000-4000-8000-000000000010",
    });
    const turn = {
      ...assistantReply,
      actions: [first, second],
      sources: [
        assistantSource(),
        assistantSource({ id: "F2", title: "Otra consulta" }),
      ],
    };
    fixture.componentRef.setInput("turns", [turn]);
    fixture.componentRef.setInput("showActions", true);
    fixture.componentRef.setInput("voiceMode", true);
    fixture.componentRef.setInput("presentation", {
      type: "presentation",
      turnId: turn.id,
      presentation: { kind: "source", sourceId: "F1" },
    });
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const sources = () =>
      root.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Consultas mostradas"] button',
      );
    expect(sources()[0].getAttribute("aria-pressed")).toBe("true");
    expect(sources()[1].getAttribute("aria-pressed")).toBe("false");

    fixture.componentRef.setInput("presentation", {
      type: "presentation",
      turnId: turn.id,
      presentation: { kind: "proposal", actionId: second.id },
    });
    fixture.detectChanges();
    const proposals = () =>
      root.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Solicitudes de cambio"] button',
      );
    expect(proposals()[1].getAttribute("aria-pressed")).toBe("true");
  });

  it("reviews one request at a time without losing other requests or coupling approval to source selection", () => {
    setupRpc();
    const fixture = TestBed.createComponent(AssistantCanvas);
    const budget = assistantAction({
      request: {
        kind: "create_budget",
        budget: {
          name: "Burger King",
          amount: "100000.00",
          schedule: { period: "monthly", startDate: "2026-12-01" },
          tagIds: [],
          newTags: [{ name: "Burger King", color: null }],
        },
      },
    });
    const tag = assistantAction({
      id: "00000000-0000-4000-8000-000000000010",
      turnId: "00000000-0000-4000-8000-000000000011",
    });
    const first = { ...assistantReply, actions: [budget] };
    const second = {
      ...assistantReply,
      id: "00000000-0000-4000-8000-000000000011",
      status: "pending",
      actions: [tag],
    } as const;
    fixture.componentRef.setInput("turns", [first, second]);
    fixture.componentRef.setInput("showActions", true);
    fixture.componentRef.setInput("voiceMode", true);
    fixture.componentRef.setInput("selection", second.id);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const cards = () => root.querySelectorAll("assistant-action-card");
    const requests = () =>
      root.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Solicitudes de cambio"] button',
      );
    expect(cards()).toHaveLength(1);
    expect(requests()).toHaveLength(2);
    expect(cards()[0].textContent).toContain("Burger King");
    expect(
      cards()[0].querySelector<HTMLButtonElement>(".primary")?.disabled,
    ).toBe(false);
    requests()[1].click();
    fixture.detectChanges();
    expect(
      cards()[0].querySelector<HTMLButtonElement>(".primary")?.disabled,
    ).toBe(true);
    fixture.componentRef.setInput("selection", first.id);
    fixture.detectChanges();
    expect(cards()).toHaveLength(1);
    expect(requests()[1].getAttribute("aria-pressed")).toBe("true");
    fixture.componentRef.setInput("turns", [
      first,
      { ...second, actions: [tag, budget] },
    ]);
    fixture.detectChanges();
    expect(cards()).toHaveLength(1);
    expect(requests()).toHaveLength(2);
  });

  it("allows approval of an interrupted voice proposal with a clear warning", () => {
    setupRpc();
    const fixture = TestBed.createComponent(AssistantCanvas);
    const turnId = "00000000-0000-4000-8000-000000000011";
    const interrupted = {
      ...assistantReply,
      id: turnId,
      text: "",
      status: "interrupted" as const,
      sources: [],
      actions: [assistantAction({ turnId })],
    };
    fixture.componentRef.setInput("turns", [interrupted]);
    fixture.componentRef.setInput("voiceMode", true);
    fixture.componentRef.setInput("showActions", true);
    fixture.componentRef.setInput("selection", turnId);
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    const card = root.querySelector("assistant-action-card");
    expect(card?.textContent).toContain("La respuesta de voz se interrumpió");
    expect(card?.querySelector<HTMLButtonElement>(".primary")?.disabled).toBe(
      false,
    );
    expect(root.textContent).toContain("Respuesta incompleta");
  });
});
