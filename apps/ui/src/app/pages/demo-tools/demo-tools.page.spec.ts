import "@angular/compiler";
import { computed, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRpcFetch, principal } from "../../../testing/rpc";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { SessionService } from "../../core/auth/session.service";
import { RPC_FETCH } from "../../core/rpc/rpc-client";
import { AssistantWorkspace } from "../../features/assistant/assistant-workspace";
import { API_URL } from "../../tokens/api-url";
import { DemoToolsPage } from "./demo-tools.page";

function setup(enabled = true) {
  const rpc = createRpcFetch({
    "demoTools.resetDemoData": () => ({ transactionCount: 42 }),
  });
  const demoToolsEnabled = signal(enabled);
  const assistantReset = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: API_URL, useValue: "http://api.test" },
      { provide: RPC_FETCH, useValue: rpc.fetch },
      {
        provide: SessionService,
        useFactory: (credentials: AuthCredentials) => ({
          demoToolsEnabled,
          user: computed(() => credentials.current()?.principal ?? null),
        }),
        deps: [AuthCredentials],
      },
      {
        provide: AssistantWorkspace,
        useValue: { demoDataReset: assistantReset },
      },
    ],
  });
  const credentials = TestBed.inject(AuthCredentials);
  credentials.accept(principal, "verified-token");
  const fixture = TestBed.createComponent(DemoToolsPage);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const click = (testId: string) => {
    const button = root.querySelector<HTMLButtonElement>(
      `[data-testid="${testId}"]`,
    );
    if (!button) throw new Error(`Missing demo-tools button: ${testId}`);
    button.click();
    fixture.detectChanges();
  };
  return {
    fixture,
    root,
    click,
    rpc,
    credentials,
    demoToolsEnabled,
    assistantReset,
  };
}

describe("DemoToolsPage", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("hides reset controls when the API does not advertise demo tools", () => {
    const { root, rpc } = setup(false);
    expect(root.querySelector('[data-testid="reset-demo-account"]')).toBeNull();
    expect(root.textContent).toContain("no está disponible");
    expect(rpc.callsTo("demoTools.resetDemoData")).toHaveLength(0);
  });

  it("sends no target ID and only resets after explicit confirmation", async () => {
    const { fixture, root, click, rpc, assistantReset } = setup();
    click("reset-demo-account");
    expect(rpc.callsTo("demoTools.resetDemoData")).toHaveLength(0);
    click("confirm-reset-demo-account");
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rpc.callsTo("demoTools.resetDemoData")).toHaveLength(1);
    expect(rpc.callsTo("demoTools.resetDemoData")[0]).toMatchObject({
      authorization: "Bearer verified-token",
    });
    expect(rpc.callsTo("demoTools.resetDemoData")[0].input).toBeUndefined();
    expect(assistantReset).toHaveBeenCalledOnce();
    expect(root.querySelector('[role="status"]')?.textContent).toContain("42");
  });

  it("invalidates confirmation if the authenticated scope changes", () => {
    const { fixture, root, click, credentials, rpc } = setup();
    click("reset-demo-account");
    credentials.accept({ ...principal, userId: "owner-b" }, "other-token");
    fixture.detectChanges();
    expect(
      root.querySelector('[data-testid="confirm-reset-demo-account"]'),
    ).toBeNull();
    credentials.accept(principal, "verified-token");
    fixture.detectChanges();
    expect(
      root.querySelector('[data-testid="confirm-reset-demo-account"]'),
    ).toBeNull();
    expect(rpc.callsTo("demoTools.resetDemoData")).toHaveLength(0);
  });
});
