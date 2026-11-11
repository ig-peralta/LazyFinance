import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientLogo } from "./client-branding";
import { McpClientIdentity } from "./client-identity";

const id = "https://opencode.ai/oauth/opencode/client.json";
const callback = "http://127.0.0.1:43219/callback";

describe("bounded local client artwork", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it("requires exact identity and published callback, not a friendly name or origin substring", () => {
    expect(clientLogo(id, callback)).toBe("/opencode-logo.png");
    for (const client of [
      "opencode",
      `${id}?logo=1`,
      `${id}.evil.test`,
      "https://opencode.ai.evil.test/oauth/opencode/client.json",
      "javascript:alert(1)",
      "http://169.254.169.254/logo",
      "data:image/svg+xml,<svg onload=alert(1)>",
    ])
      expect(clientLogo(client, callback)).toBeNull();
    for (const redirect of [
      null,
      "invalid",
      "http://10.0.0.1/callback",
      "http://localhost.evil.test/callback",
      "http://user@localhost/callback",
      "http://localhost/callback?track=1",
      "https://evil.test/callback",
    ])
      expect(clientLogo(id, redirect)).toBeNull();
  });

  it("shows loaded artwork decoratively without replacing the security facts", () => {
    const fixture = TestBed.createComponent(McpClientIdentity);
    fixture.componentRef.setInput("clientId", id);
    fixture.componentRef.setInput("name", "Nombre declarado diferente");
    fixture.componentRef.setInput("redirectUri", callback);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const image = root.querySelector("img");
    image?.dispatchEvent(new Event("load"));
    fixture.detectChanges();
    expect(image?.classList.contains("loaded")).toBe(true);
    expect(root.textContent).toContain("Nombre declarado diferente");
    expect(root.textContent).toContain(id);
    expect(root.textContent).toContain(callback);
  });

  it("renders hostile claims as text and never uses untrusted metadata as image or HTML", () => {
    const fixture = TestBed.createComponent(McpClientIdentity);
    fixture.componentRef.setInput(
      "clientId",
      "https://169.254.169.254/secret.svg",
    );
    fixture.componentRef.setInput(
      "name",
      '<img src="https://evil.test/tracking" onerror="alert(1)">',
    );
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("<img");
    expect(root.textContent).toContain("Identidad no verificada");
    expect(root.textContent).toContain("No registrado");
  });

  it("keeps technical identity facts available in a closed disclosure", () => {
    const fixture = TestBed.createComponent(McpClientIdentity);
    fixture.componentRef.setInput("clientId", id);
    fixture.componentRef.setInput("name", "OpenCode");
    fixture.componentRef.setInput("redirectUri", callback);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const details = root.querySelector("details");
    expect(details?.open).toBe(false);
    expect(details?.querySelector("summary")?.textContent).toBe(
      "Detalles de la conexión",
    );
    expect(details?.textContent).toContain(id);
    expect(details?.textContent).toContain(callback);
    expect(root.querySelector(".summary")?.textContent).toContain(
      "Identidad no verificada",
    );
  });

  it("keeps a fixed decorative fallback for slow, failed and missing logos and resets on client replacement", async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(McpClientIdentity);
    fixture.componentRef.setInput("clientId", id);
    fixture.componentRef.setInput("name", "Cliente");
    fixture.componentRef.setInput("redirectUri", callback);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const image = root.querySelector("img");
    expect(image?.getAttribute("src")).toBe("/opencode-logo.png");
    expect(image?.alt).toBe("");
    expect(image?.width).toBe(48);
    await vi.advanceTimersByTimeAsync(2001);
    fixture.detectChanges();
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("App");
    fixture.componentRef.setInput(
      "redirectUri",
      "http://localhost:51234/callback",
    );
    fixture.detectChanges();
    root.querySelector("img")?.dispatchEvent(new Event("error"));
    fixture.detectChanges();
    expect(root.querySelector("img")).toBeNull();
    fixture.componentRef.setInput("clientId", "other-client");
    fixture.detectChanges();
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("other-client");
  });
});
