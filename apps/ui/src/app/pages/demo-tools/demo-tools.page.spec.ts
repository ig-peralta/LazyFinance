import "@angular/compiler";
import { computed, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import {
  createRpcFetch,
  principal,
  type RpcHandlers,
  type RpcOutput,
  rpcFailure,
} from "../../../testing/rpc";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { SessionService } from "../../core/auth/session.service";
import { RPC_FETCH } from "../../core/rpc/rpc-client";
import { AssistantWorkspace } from "../../features/assistant/assistant-workspace";
import { API_URL } from "../../tokens/api-url";
import { DemoToolsPage } from "./demo-tools.page";

function setup(enabled = true, handlers: RpcHandlers = {}) {
  const rpc = createRpcFetch({
    "demoTools.resetDemoData": () => ({ transactionCount: 42 }),
    "demoTools.createInternalTransaction": () => ({
      transactionCount: 2,
      description: "Aporte al fondo de emergencia",
      amount: "45000.00",
    }),
    "demoTools.createExternalTransaction": () => ({
      transactionCount: 1,
      description: "Compra en feria",
      amount: "15000.00",
    }),
    ...handlers,
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

  it("hides all controls when the API does not advertise demo tools", () => {
    const { root, rpc } = setup(false);
    expect(root.querySelector('[data-testid="reset-demo-account"]')).toBeNull();
    expect(
      root.querySelector('[data-testid="create-internal-demo-transaction"]'),
    ).toBeNull();
    expect(
      root.querySelector('[data-testid="create-external-demo-transaction"]'),
    ).toBeNull();
    expect(root.textContent).toContain("no está disponible");
    expect(rpc.callsTo("demoTools.resetDemoData")).toHaveLength(0);
  });

  it("creates each kind without owner, account or amount input and shows the result", async () => {
    const { fixture, root, click, rpc, assistantReset } = setup();
    click("create-internal-demo-transaction");
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rpc.callsTo("demoTools.createInternalTransaction")).toHaveLength(1);
    expect(rpc.callsTo("demoTools.createInternalTransaction")[0]).toMatchObject(
      { authorization: "Bearer verified-token" },
    );
    expect(
      rpc.callsTo("demoTools.createInternalTransaction")[0].input,
    ).toBeUndefined();
    expect(root.textContent).toContain("2 movimientos sin etiqueta");
    click("create-external-demo-transaction");
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rpc.callsTo("demoTools.createExternalTransaction")).toHaveLength(1);
    expect(
      rpc.callsTo("demoTools.createExternalTransaction")[0].input,
    ).toBeUndefined();
    expect(root.textContent).toContain("Compra en feria");
    expect(root.textContent).toContain("1 movimiento sin etiqueta");
    expect(assistantReset).not.toHaveBeenCalled();
  });

  it("disables both actions while pending and clears a failed transaction result", async () => {
    const pending =
      deferred<RpcOutput<"demoTools.createInternalTransaction">>();
    const { fixture, root, click, rpc } = setup(true, {
      "demoTools.createInternalTransaction": () => pending.promise,
      "demoTools.createExternalTransaction": () => rpcFailure(),
    });
    click("create-internal-demo-transaction");
    expect(
      root.querySelector<HTMLButtonElement>(
        '[data-testid="create-external-demo-transaction"]',
      )?.disabled,
    ).toBe(true);
    click("create-external-demo-transaction");
    expect(rpc.callsTo("demoTools.createExternalTransaction")).toHaveLength(0);
    pending.resolve({
      transactionCount: 2,
      description: "Ahorro",
      amount: "25000.00",
    });
    await fixture.whenStable();
    fixture.detectChanges();
    click("create-external-demo-transaction");
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      "No pudimos confirmar",
    );
    expect(root.textContent).not.toContain("Ahorro: $25000.00");
  });

  it("does not show a transaction result from a previous authenticated scope", async () => {
    const old = deferred<RpcOutput<"demoTools.createExternalTransaction">>();
    const { fixture, root, click, credentials } = setup(true, {
      "demoTools.createExternalTransaction": () => old.promise,
    });
    click("create-external-demo-transaction");
    credentials.accept({ ...principal, userId: "owner-b" }, "other-token");
    fixture.detectChanges();
    old.resolve({
      transactionCount: 1,
      description: "Movimiento antiguo",
      amount: "12000.00",
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).not.toContain("Movimiento antiguo");
    expect(root.querySelector('[role="alert"]')).toBeNull();
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
