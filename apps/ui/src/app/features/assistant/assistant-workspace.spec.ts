import { Component } from "@angular/core";
import { DeferBlockBehavior, TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupRpc } from "../../../testing/rpc";
import { AppShell } from "../../layout/app-shell/app-shell";
import { AssistantVoiceClient } from "./assistant-voice.client";
import { AssistantWorkspace } from "./assistant-workspace";

@Component({ template: "<h1>Financial destination</h1>" })
class Destination {}

describe("single shell-owned assistant across real route navigation", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it("retains the same composer/session, restores focus and clears private state on owner removal", async () => {
    TestBed.configureTestingModule({
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
      providers: [
        provideRouter([
          { path: "a", component: Destination },
          { path: "b", component: Destination },
        ]),
      ],
    });
    const f = setupRpc(
      {
        "assistant.configuration": () => ({
          enabled: true,
          demonstration: true,
          provider: "demo",
          model: "",
          maxTurns: 24,
          maxInput: 2000,
        }),
        "assistant.conversations": () => [],
      },
      "browser",
      true,
    );
    f.navigate.mockRestore();
    vi.spyOn(AssistantVoiceClient.prototype, "configuration").mockResolvedValue(
      { enabled: false },
    );
    const fixture = TestBed.createComponent(AppShell);
    const root: HTMLElement = fixture.nativeElement;
    document.body.append(root);
    fixture.detectChanges();
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    await router.navigateByUrl("/a");
    fixture.detectChanges();
    await fixture.whenStable();
    const workspace = TestBed.inject(AssistantWorkspace);
    const launcher = root.querySelector<HTMLButtonElement>(
      'button[aria-keyshortcuts="?"]',
    );
    if (!launcher) throw new Error("Missing shell assistant control");
    launcher.focus();
    launcher.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const composer = root.querySelector("textarea");
    if (!composer) throw new Error("Missing persistent composer");
    composer.value = "Un borrador financiero privado";
    composer.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    await router.navigateByUrl("/b");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelectorAll("assistant-page")).toHaveLength(1);
    expect(root.querySelector("textarea")).toBe(composer);
    expect(composer.value).toBe("Un borrador financiero privado");
    expect(f.callsTo("assistant.configuration")).toHaveLength(1);
    expect(f.callsTo("assistant.conversations")).toHaveLength(1);
    workspace.minimize();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(launcher.isConnected).toBe(true);
    expect(root.querySelectorAll('[aria-keyshortcuts="?"]')).toHaveLength(1);
    expect(root.querySelector(".workspace-topbar")?.contains(launcher)).toBe(
      true,
    );
    expect(document.activeElement).toBe(launcher);
    launcher?.focus();
    launcher?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(composer);
    workspace.minimize();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(launcher);
    workspace.modal.set(true);
    workspace.open();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector(".workspace-body")?.hasAttribute("inert")).toBe(
      true,
    );
    expect(
      root
        .querySelector("[role='dialog'].assistant")
        ?.getAttribute("aria-modal"),
    ).toBe("true");
    workspace.minimize();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector(".workspace-body")?.hasAttribute("inert")).toBe(
      false,
    );
    f.credentials.clear();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(workspace.opened()).toBe(false);
    expect(composer.value).toBe("");
    expect(root.textContent).not.toContain("Un borrador financiero privado");
    root.remove();
  });
});
