import "@angular/compiler";
import { type ResourceStatus, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, type Routes } from "@angular/router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { deferred } from "../../testing/deferred";
import {
  budgetDetail,
  budgetRevision,
  createRpcFetch,
  movement,
  principal,
  type RpcHandlers,
  type RpcOutput,
  type RpcProcedure,
  rpcFailure,
  savingsGoal,
  savingsProgress,
  transactionPage,
} from "../../testing/rpc";
import { App } from "../app";
import { routes } from "../app.routes";
import { AuthCredentials } from "../core/auth/auth-credentials";
import { SessionService } from "../core/auth/session.service";
import { initialReadSettled } from "../core/rendering/workspace-preparation";
import { RPC_FETCH } from "../core/rpc/rpc-client";
import { API_URL } from "../tokens/api-url";
import type { WorkspacePageDefinition } from "./workspace-route";

const budgetPath = `/presupuestos/${budgetDetail.id}`;
const goalPath = `/metas/${savingsGoal.id}`;
const evidencePath = `${budgetPath}/movimientos?revision=${budgetRevision.id}&month=2026-11`;

async function setup(path: string, handlers: RpcHandlers = {}) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const rpc = createRpcFetch({
    "objectives.list": () => [savingsGoal],
    "objectives.budget": () => budgetDetail,
    "objectives.savingsGoal": () => savingsGoal,
    ...handlers,
  });
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      { provide: API_URL, useValue: "http://api.test" },
      { provide: RPC_FETCH, useValue: rpc.fetch },
    ],
  });
  TestBed.inject(AuthCredentials).accept(principal, "alice");
  vi.spyOn(TestBed.inject(SessionService), "start").mockResolvedValue();
  const fixture = TestBed.createComponent(App);
  const router = TestBed.inject(Router);
  await router.navigateByUrl(path);
  fixture.detectChanges();
  return {
    ...rpc,
    fixture,
    router,
    root: fixture.nativeElement as HTMLElement,
    async settle(ms = 0) {
      await vi.advanceTimersByTimeAsync(ms);
      for (let turn = 0; turn < 5; turn++) {
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(0);
      }
      fixture.detectChanges();
    },
  };
}

describe("workspace pages' initial visible-read contracts", () => {
  beforeAll(async () => {
    // This suite tests actual page declarations, not module-loader I/O timing.
    // Separate boundary tests retain deferred imports to exercise that lifetime.
    async function preload(entries: Routes): Promise<void> {
      await Promise.all(
        entries.map(async (route) => {
          const page = route.data?.["page"] as
            | WorkspacePageDefinition
            | undefined;
          if (page) await page.load();
          if (route.children) await preload(route.children);
        }),
      );
    }
    await preload(routes);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it.each([
    ["idle", false],
    ["loading", false],
    ["reloading", false],
    ["resolved", true],
    ["local", true],
    ["error", true],
  ] satisfies [
    ResourceStatus,
    boolean,
  ][])("treats resource status %s as settled=%s", (status, settled) => {
    expect(initialReadSettled({ status: signal(status) })).toBe(settled);
  });

  it.each([
    ["/dashboard", "summaries.monthly"],
    ["/dashboard", "summaries.comparison"],
    ["/dashboard", "accounts.list"],
    ["/dashboard", "objectives.list"],
    ["/dashboard", "objectives.progress"],
    ["/dashboard", "transactions.list"],
    ["/dashboard", "objectives.savingsProgress"],
    ["/cuentas", "accounts.list"],
    ["/etiquetas", "tags.list"],
    ["/presupuestos-y-metas", "objectives.list"],
    ["/presupuestos-y-metas", "objectives.progress"],
    ["/metas", "objectives.list"],
    [budgetPath, "objectives.budget"],
    [goalPath, "objectives.savingsGoal"],
    [goalPath, "objectives.savingsProgress"],
    [evidencePath, "objectives.budgetContributions"],
    ["/ingresos/fuentes", "income.sources"],
    ["/ingresos", "income.summary"],
    ["/ingresos", "transactions.list"],
    ["/movimientos", "accounts.list"],
    ["/movimientos", "tags.list"],
    ["/movimientos", "transactions.list"],
    [`/movimientos/${movement.id}`, "transactions.detail"],
    ["/comenzar", "accounts.list"],
    ["/comenzar", "income.sources"],
    ["/comenzar", "objectives.list"],
  ] satisfies [
    string,
    RpcProcedure,
  ][])("keeps %s concealed until %s has a usable result", async (path, procedure) => {
    const read = deferred<Response>();
    const f = await setup(path, { [procedure]: () => read.promise });
    await f.settle(1_100);
    expect(f.callsTo(procedure)).toHaveLength(1);
    expect(f.root.querySelector("workspace-loading")).not.toBeNull();
    expect(
      f.root.querySelector(".workspace-preparing[inert][aria-hidden=true]"),
    ).not.toBeNull();
    read.resolve(rpcFailure());
    await f.settle();
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(f.callsTo(procedure)).toHaveLength(1);
  });

  it("waits for a conditional savings measurement registered after its parent read resolves", async () => {
    const goals = deferred<RpcOutput<"objectives.list">>();
    const progress = deferred<RpcOutput<"objectives.savingsProgress">>();
    const f = await setup("/dashboard", {
      "objectives.list": () => goals.promise,
      "objectives.savingsProgress": () => progress.promise,
    });
    await f.settle(1_100);
    expect(f.callsTo("objectives.savingsProgress")).toHaveLength(0);
    goals.resolve([savingsGoal]);
    await f.settle();
    expect(f.callsTo("objectives.savingsProgress")).toHaveLength(1);
    expect(f.root.querySelector("workspace-loading")).not.toBeNull();
    progress.resolve(savingsProgress);
    await f.settle();
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(f.root.textContent).toContain("Fondo de calma");
    expect(f.callsTo("objectives.savingsProgress")).toHaveLength(1);
    expect(f.callsTo("objectives.savingsContributions")).toHaveLength(0);
    expect(f.callsTo("objectives.savingsGoalHistory")).toHaveLength(0);
  });

  it("excludes optional suggestions, unopened editors, evidence and additional pages", async () => {
    const suggestions = deferred<RpcOutput<"tags.suggestions">>();
    const f = await setup("/dashboard", {
      "transactions.list": () => transactionPage([movement], "another-page"),
      "tags.suggestions": () => suggestions.promise,
    });
    await f.settle(1_000);
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(f.callsTo("transactions.list")).toHaveLength(1);
    expect(f.callsTo("tags.list")).toHaveLength(0);
    expect(f.callsTo("objectives.savingsContributions")).toHaveLength(0);
    expect(f.root.querySelector("editor-drawer")).toBeNull();
    suggestions.resolve([]);
  });

  it.each([
    "/movimientos?direction=invalid",
    `${budgetPath}/movimientos?revision=invalid`,
  ])("reveals %s validation errors without waiting for an intentionally idle read", async (path) => {
    const f = await setup(path);
    await f.settle(1_000);
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(f.callsTo("transactions.list")).toHaveLength(0);
    expect(f.callsTo("objectives.budgetContributions")).toHaveLength(0);
  });

  it("waits for onboarding metadata before starting its dependent checklist reads", async () => {
    const metadata = deferred<RpcOutput<"onboarding.state">>();
    const accounts = deferred<RpcOutput<"accounts.list">>();
    const f = await setup("/comenzar", {
      "onboarding.state": () => metadata.promise,
      "accounts.list": () => accounts.promise,
    });
    await f.settle(1_100);
    expect(f.callsTo("accounts.list")).toHaveLength(0);
    expect(f.root.querySelector("workspace-loading")).not.toBeNull();
    metadata.resolve({ status: "active", completedAt: null });
    await f.settle();
    expect(f.callsTo("accounts.list")).toHaveLength(1);
    expect(f.root.querySelector("workspace-loading")).not.toBeNull();
    accounts.resolve([]);
    await f.settle();
    expect(f.root.querySelector("workspace-loading")).toBeNull();
  });

  it("reveals onboarding metadata errors without starting ineligible checklist reads", async () => {
    const f = await setup("/comenzar", {
      "onboarding.state": () => rpcFailure(),
    });
    await f.settle(1_000);
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(f.callsTo("accounts.list")).toHaveLength(0);
  });

  it("follows completed-onboarding redirects and waits for the actual destination", async () => {
    const read = deferred<RpcOutput<"summaries.monthly"> | Response>();
    const f = await setup("/comenzar", {
      "onboarding.state": () => ({
        status: "completed",
        completedAt: "2026-11-08T15:00:00.000Z",
      }),
      "summaries.monthly": () => read.promise,
    });
    await f.settle(1_100);
    expect(f.router.url).toBe("/dashboard");
    expect(f.root.querySelector("workspace-loading")).not.toBeNull();
    read.resolve(rpcFailure());
    await f.settle();
    expect(f.root.querySelector("workspace-loading")).toBeNull();
  });

  it("explicitly declares a no-read security screen ready after the minimum second", async () => {
    const f = await setup("/seguridad");
    await f.settle(999);
    expect(f.root.querySelector("workspace-loading")).not.toBeNull();
    await f.settle(1);
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(f.root.textContent).toContain("Acceso y seguridad");
  });
});
