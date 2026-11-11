import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { assistantAction, assistantReply } from "../../../../testing/assistant";
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
});
