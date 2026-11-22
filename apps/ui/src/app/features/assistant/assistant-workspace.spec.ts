import { Location } from "@angular/common";
import { provideLocationMocks } from "@angular/common/testing";
import { Component } from "@angular/core";
import { DeferBlockBehavior, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter, Router } from "@angular/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupRpc } from "../../../testing/rpc";
import { AppShell } from "../../layout/app-shell/app-shell";
import { AssistantEntry } from "../../pages/assistant/assistant-entry";
import type { Icon } from "../../shared/ui/icon";
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
          { path: "asistente", component: AssistantEntry },
        ]),
        provideLocationMocks(),
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
    const bubbleIcon = (selector: string) =>
      (
        fixture.debugElement.query(By.css(`${selector} app-icon`))
          ?.componentInstance as Icon | undefined
      )?.name();
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
    expect(workspace.modal()).toBe(true);
    expect(root.querySelector(".assistant-modal-open")).not.toBeNull();
    expect(root.querySelector(".assistant-mount")?.hasAttribute("hidden")).toBe(
      false,
    );
    expect(
      root
        .querySelector(".assistant[role='dialog']")
        ?.getAttribute("aria-modal"),
    ).toBe("true");
    expect(
      root.querySelector(".workspace-content")?.hasAttribute("inert"),
    ).toBe(true);
    expect(root.querySelector(".workspace-topbar")?.hasAttribute("inert")).toBe(
      true,
    );
    await router.navigateByUrl("/b");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(workspace.opened()).toBe(false);
    expect(workspace.minimized()).toBe(true);
    expect(root.querySelector(".assistant-bubble")?.textContent).toContain(
      "Conversación minimizada",
    );
    expect(root.querySelector(".assistant-modal-open")).toBeNull();
    expect(
      root.querySelector(".workspace-content")?.hasAttribute("inert"),
    ).toBe(false);
    expect(root.querySelectorAll("assistant-page")).toHaveLength(1);
    expect(root.querySelector("textarea")).toBe(composer);
    expect(composer.value).toBe("Un borrador financiero privado");
    expect(f.callsTo("assistant.configuration")).toHaveLength(1);
    expect(f.callsTo("assistant.conversations")).toHaveLength(1);
    workspace.open();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(workspace.opened()).toBe(true);
    await router.navigateByUrl("/asistente");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(workspace.home()).toBe(true);
    expect(workspace.modal()).toBe(false);
    expect(workspace.opened()).toBe(false);
    expect(workspace.minimized()).toBe(true);
    expect(root.querySelector(".assistant-mount")?.hasAttribute("hidden")).toBe(
      true,
    );
    expect(root.querySelector(".assistant-bubble")).not.toBeNull();
    expect(launcher.hidden).toBe(false);
    expect(root.querySelector(".assistant-modal-open")).toBeNull();
    root.querySelector<HTMLButtonElement>(".assistant-bubble-open")?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(workspace.opened()).toBe(true);
    expect(root.querySelector(".assistant-mount")?.hasAttribute("hidden")).toBe(
      false,
    );
    expect(root.querySelector(".assistant-bubble")).toBeNull();
    root
      .querySelector(".assistant-mount")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(workspace.opened()).toBe(true);
    expect(
      root
        .querySelector(".assistant[role='region']")
        ?.hasAttribute("aria-modal"),
    ).toBe(false);
    expect(
      root.querySelector(".workspace-content")?.hasAttribute("inert"),
    ).toBe(false);
    const voice = fixture.debugElement
      .query(By.css("assistant-page"))
      .injector.get(AssistantVoiceClient);
    const end = vi.spyOn(voice, "end");
    voice.state.set("listening");
    await router.navigateByUrl("/a");
    fixture.detectChanges();
    await fixture.whenStable();
    expect(workspace.opened()).toBe(false);
    expect(workspace.minimized()).toBe(true);
    expect(root.querySelector(".assistant-modal-open")).toBeNull();
    expect(root.querySelector(".assistant-bubble")?.textContent).toContain(
      "Micrófono activo",
    );
    expect(bubbleIcon(".assistant-bubble-open")).toBe("microphone");
    expect(bubbleIcon('[aria-label="Silenciar micrófono"]')).toBe("microphone");
    expect(end).not.toHaveBeenCalled();
    workspace.endVoice();
    fixture.detectChanges();
    launcher.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector(".assistant-modal-open")).not.toBeNull();
    expect(
      root
        .querySelector(".assistant[role='dialog']")
        ?.getAttribute("aria-modal"),
    ).toBe("true");
    expect(root.querySelector("textarea")).toBe(composer);
    composer.click();
    expect(workspace.opened()).toBe(true);
    root.querySelector<HTMLElement>(".assistant-mount")?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(workspace.opened()).toBe(false);
    expect(workspace.minimized()).toBe(true);
    expect(root.querySelector(".assistant-bubble")).not.toBeNull();
    expect(document.activeElement).toBe(launcher);
    launcher.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector("textarea")).toBe(composer);
    workspace.minimize();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector(".assistant-modal-open")).toBeNull();
    expect(root.querySelector(".assistant-mount")?.hasAttribute("hidden")).toBe(
      true,
    );
    expect(root.querySelector(".assistant-bubble")?.textContent).toContain(
      "Conversación minimizada",
    );
    workspace.textPending.set(true);
    fixture.detectChanges();
    expect(root.querySelector(".assistant-bubble")?.textContent).toContain(
      "Preparando respuesta…",
    );
    workspace.textPending.set(false);
    expect(
      root.querySelector(".workspace-content")?.hasAttribute("inert"),
    ).toBe(false);
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
    const mute = vi
      .spyOn(voice, "mute")
      .mockImplementation(() =>
        voice.state.set(voice.state() === "muted" ? "listening" : "muted"),
      );
    voice.state.set("listening");
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector(".assistant-bubble")?.textContent).toContain(
      "Micrófono activo",
    );
    expect(bubbleIcon(".assistant-bubble-open")).toBe("microphone");
    expect(bubbleIcon('[aria-label="Silenciar micrófono"]')).toBe("microphone");
    root
      .querySelector<HTMLButtonElement>('[aria-label="Silenciar micrófono"]')
      ?.click();
    fixture.detectChanges();
    expect(mute).toHaveBeenCalledOnce();
    expect(root.querySelector(".assistant-bubble")?.textContent).toContain(
      "Micrófono silenciado",
    );
    expect(bubbleIcon(".assistant-bubble-open")).toBe("microphoneMuted");
    expect(bubbleIcon('[aria-label="Activar micrófono"]')).toBe(
      "microphoneMuted",
    );
    root
      .querySelector<HTMLButtonElement>('[aria-label="Activar micrófono"]')
      ?.click();
    fixture.detectChanges();
    expect(mute).toHaveBeenCalledTimes(2);
    expect(bubbleIcon(".assistant-bubble-open")).toBe("microphone");
    expect(bubbleIcon('[aria-label="Silenciar micrófono"]')).toBe("microphone");
    root
      .querySelector<HTMLButtonElement>('[aria-label="Terminar voz"]')
      ?.click();
    fixture.detectChanges();
    expect(voice.state()).toBe("off");
    expect(root.querySelector(".assistant-bubble")?.textContent).toContain(
      "Conversación minimizada",
    );
    root.querySelector<HTMLButtonElement>(".assistant-bubble-open")?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector(".assistant-bubble")).toBeNull();
    expect(
      root.querySelector(".assistant")?.contains(document.activeElement),
    ).toBe(true);
    workspace.minimize();
    fixture.detectChanges();
    await fixture.whenStable();
    workspace.open();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      root.querySelector(".workspace-content")?.hasAttribute("inert"),
    ).toBe(true);
    expect(
      root
        .querySelector("[role='dialog'].assistant")
        ?.getAttribute("aria-modal"),
    ).toBe("true");
    composer.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    expect(workspace.opened()).toBe(false);
    expect(document.activeElement).toBe(launcher);
    expect(root.querySelector(".workspace-body")?.hasAttribute("inert")).toBe(
      false,
    );
    f.credentials.clear();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(workspace.opened()).toBe(false);
    expect(composer.value).toBe("");
    expect(root.querySelector(".assistant-bubble")).toBeNull();
    expect(root.textContent).not.toContain("Un borrador financiero privado");
    root.remove();
  });

  it("minimizes on browser back and forward without remounting the assistant", async () => {
    TestBed.configureTestingModule({
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
      providers: [
        provideRouter([
          { path: "", pathMatch: "full", redirectTo: "a" },
          { path: "a", component: Destination },
          { path: "b", component: Destination },
        ]),
        provideLocationMocks(),
      ],
    });
    const f = setupRpc({
      "assistant.configuration": () => ({
        enabled: true,
        demonstration: true,
        provider: "demo",
        model: "",
        maxTurns: 24,
        maxInput: 2000,
      }),
    });
    f.navigate.mockRestore();
    vi.spyOn(AssistantVoiceClient.prototype, "configuration").mockResolvedValue(
      {
        enabled: false,
      },
    );
    const fixture = TestBed.createComponent(AppShell);
    const root: HTMLElement = fixture.nativeElement;
    document.body.append(root);
    try {
      const router = TestBed.inject(Router);
      fixture.detectChanges();
      router.initialNavigation();
      await fixture.whenStable();
      await router.navigateByUrl("/a");
      fixture.detectChanges();
      await fixture.whenStable();
      const workspace = TestBed.inject(AssistantWorkspace);
      workspace.open();
      fixture.detectChanges();
      await fixture.whenStable();
      const composer = root.querySelector("textarea");
      expect(composer).not.toBeNull();
      await router.navigateByUrl("/b");
      fixture.detectChanges();
      await fixture.whenStable();
      expect(workspace.minimized()).toBe(true);
      workspace.open();
      fixture.detectChanges();
      await fixture.whenStable();
      const location = TestBed.inject(Location);
      expect(location.path()).toBe("/b");
      location.back();
      expect(location.path()).toBe("/a");
      await vi.waitFor(() => expect(router.url).toBe("/a"));
      fixture.detectChanges();
      await fixture.whenStable();
      expect(router.url).toBe("/a");
      expect(workspace.opened()).toBe(false);
      expect(workspace.minimized()).toBe(true);
      expect(root.querySelector("textarea")).toBe(composer);
      workspace.open();
      fixture.detectChanges();
      await fixture.whenStable();
      location.forward();
      await vi.waitFor(() => expect(router.url).toBe("/b"));
      fixture.detectChanges();
      await fixture.whenStable();
      expect(router.url).toBe("/b");
      expect(workspace.opened()).toBe(false);
      expect(workspace.minimized()).toBe(true);
      expect(root.querySelector("textarea")).toBe(composer);
    } finally {
      root.remove();
    }
  });

  it("opens the inline home on initial entry but keeps a minimized return closed", async () => {
    TestBed.configureTestingModule({
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
      providers: [
        provideRouter([
          { path: "asistente", component: AssistantEntry },
          { path: "a", component: Destination },
        ]),
      ],
    });
    const f = setupRpc({
      "assistant.configuration": () => ({
        enabled: true,
        demonstration: true,
        provider: "demo",
        model: "",
        maxTurns: 24,
        maxInput: 2000,
      }),
    });
    f.navigate.mockRestore();
    vi.spyOn(AssistantVoiceClient.prototype, "configuration").mockResolvedValue(
      {
        enabled: false,
      },
    );
    const fixture = TestBed.createComponent(AppShell);
    const root: HTMLElement = fixture.nativeElement;
    document.body.append(root);
    try {
      fixture.detectChanges();
      await fixture.whenStable();
      const router = TestBed.inject(Router);
      await router.navigateByUrl("/asistente");
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const workspace = TestBed.inject(AssistantWorkspace);
      expect(workspace.home()).toBe(true);
      expect(workspace.opened()).toBe(true);
      expect(root.querySelector(".assistant[role='region']")).not.toBeNull();
      const composer = root.querySelector("textarea");
      expect(composer).not.toBeNull();
      await router.navigateByUrl("/a");
      fixture.detectChanges();
      await fixture.whenStable();
      expect(workspace.minimized()).toBe(true);
      await router.navigateByUrl("/asistente");
      fixture.detectChanges();
      await fixture.whenStable();
      expect(workspace.opened()).toBe(false);
      expect(workspace.minimized()).toBe(true);
      expect(
        root.querySelector(".assistant-mount")?.hasAttribute("hidden"),
      ).toBe(true);
      expect(root.querySelector(".assistant-bubble")).not.toBeNull();
      root.querySelector<HTMLButtonElement>(".assistant-bubble-open")?.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(root.querySelector("textarea")).toBe(composer);
    } finally {
      root.remove();
    }
  });
});
