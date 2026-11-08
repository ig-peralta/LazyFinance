/// <reference types="node" />
import "@angular/compiler";
import { readFileSync } from "node:fs";
import { Component, inject, signal, type Type } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  provideRouter,
  Router,
  RouterLink,
  RouterOutlet,
} from "@angular/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../testing/deferred";
import {
  account,
  createRpcFetch,
  principal,
  type RpcOutput,
  rpcFailure,
} from "../../testing/rpc";
import { App } from "../app";
import { AuthCredentials } from "../core/auth/auth-credentials";
import {
  SessionService,
  type SessionStatus,
} from "../core/auth/session.service";
import { reportWorkspaceReadiness } from "../core/rendering/workspace-preparation";
import { RPC_FETCH } from "../core/rpc/rpc-client";
import { AccountsData } from "../features/accounts/accounts.data";
import { API_URL } from "../tokens/api-url";
import { WorkspaceBoundary } from "./workspace-boundary";
import { workspaceRoute } from "./workspace-route";

const mounted = vi.fn();
@Component({
  imports: [RouterOutlet],
  template: '<div class="verified-shell"><router-outlet /></div>',
})
class ShellFixture {}

@Component({
  imports: [RouterLink],
  providers: [AccountsData],
  template: `
    <p>private-content {{ params().get("id") }} {{ query }}</p>
    @if (accounts.error()) { <p role="alert">Read failed</p> }
    @else { @for (account of accounts.value(); track account.id) { <p>{{ account.alias }}</p> } }
    <a [routerLink]="['../two']">Otro movimiento</a>
    <button type="button" (click)="accounts.reload()">Reload data</button>
  `,
})
class PrivatePage {
  private readonly route = inject(ActivatedRoute);
  readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly query = this.route.snapshot.queryParamMap.get("account");
  readonly accounts = inject(AccountsData).accounts;

  constructor() {
    reportWorkspaceReadiness(this.accounts);
    mounted();
  }
}

@Component({ template: "<h1>Missing readiness</h1>" })
class UnreportedPage {}

@Component({ template: "<h1>Login</h1>" })
class LoginFixture {}

async function setup(initialStatus: SessionStatus = "loading") {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  mounted.mockClear();
  const session = {
    status: signal<SessionStatus>(initialStatus),
    error: signal<string | null>(null),
    start: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
  };
  const pending = deferred<Type<unknown>>();
  const read = deferred<RpcOutput<"accounts.list"> | Response>();
  const rpc = createRpcFetch({ "accounts.list": () => read.promise });
  const load = vi.fn(() => pending.promise);
  TestBed.configureTestingModule({
    providers: [
      { provide: SessionService, useValue: session },
      { provide: API_URL, useValue: "http://api.test" },
      { provide: RPC_FETCH, useValue: rpc.fetch },
      provideRouter([
        { path: "login", component: LoginFixture },
        {
          path: "",
          component: WorkspaceBoundary,
          children: [
            {
              path: "",
              component: ShellFixture,
              children: [
                workspaceRoute("movimientos/:id", {
                  heading: "Detalle del movimiento",
                  load,
                }),
                workspaceRoute("cuentas", {
                  heading: "Cuentas",
                  load: async () => PrivatePage,
                }),
              ],
            },
          ],
        },
      ]),
    ],
  });
  const credentials = TestBed.inject(AuthCredentials);
  if (initialStatus === "ready") credentials.accept(principal, "alice");
  const fixture = TestBed.createComponent(App);
  const router = TestBed.inject(Router);
  await router.navigateByUrl("/movimientos/one?account=a#activity");
  fixture.detectChanges();
  return {
    ...rpc,
    fixture,
    router,
    session,
    credentials,
    load,
    pending,
    read,
    root: fixture.nativeElement as HTMLElement,
    accept() {
      credentials.accept(principal, "alice");
      session.status.set("ready");
    },
    async settle(ms = 0) {
      await vi.advanceTimersByTimeAsync(ms);
      // Drain render/Promise turns without waiting for intentionally pending resources.
      for (let turn = 0; turn < 3; turn++) {
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(0);
      }
      fixture.detectChanges();
    },
  };
}

describe("prepare immediately, reveal when ready", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it("keeps the static first paint aligned with the Angular loading frame", async () => {
    const f = await setup();
    const before = new DOMParser()
      .parseFromString(readFileSync("src/index.html", "utf8"), "text/html")
      .querySelector(".workspace-loading");
    const after = f.root.querySelector(".workspace-loading");
    const presentation = (root: Element | null) =>
      Array.from(root?.querySelectorAll("*") ?? [], (element) => ({
        tag: element.tagName,
        classes: element.className.toString(),
        text: element.childElementCount ? null : element.textContent?.trim(),
        role: element.getAttribute("role"),
      }));
    expect(before).not.toBeNull();
    expect(presentation(before)).toEqual(presentation(after));
  });

  it("loads destination code concurrently with authentication but mounts/fetches nothing private", async () => {
    const f = await setup();
    f.pending.resolve(PrivatePage);
    await f.settle(1_500);
    expect(f.root.textContent).toContain("Preparando tu espacio");
    expect(f.root.querySelector(".verified-shell")).toBeNull();
    expect(f.load).toHaveBeenCalledOnce();
    expect(mounted).not.toHaveBeenCalled();
    expect(f.callsTo("accounts.list")).toHaveLength(0);
  });

  it("starts verified reads within the animation and reveals the same prepared instance at one second", async () => {
    const f = await setup();
    f.accept();
    f.pending.resolve(PrivatePage);
    f.read.resolve([account("prepared")]);
    await f.settle(999);
    expect(f.callsTo("accounts.list")).toHaveLength(1);
    expect(f.callsTo("accounts.list")[0].authorization).toBe("Bearer alice");
    expect(f.load).toHaveBeenCalledOnce();
    expect(mounted).toHaveBeenCalledOnce();
    const prepared = f.root.querySelector<HTMLElement>(".workspace-prepared");
    if (!prepared) throw new Error("Missing prepared workspace");
    expect(prepared.textContent).toContain("prepared");
    expect(prepared.hasAttribute("inert")).toBe(true);
    expect(prepared.getAttribute("aria-hidden")).toBe("true");
    expect(prepared.classList.contains("workspace-preparing")).toBe(true);
    await f.settle(1);
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(f.root.querySelector(".workspace-prepared")).toBe(prepared);
    expect(prepared.hasAttribute("inert")).toBe(false);
    expect(prepared.hasAttribute("aria-hidden")).toBe(false);
    expect(prepared.classList.contains("workspace-preparing")).toBe(false);
    expect(f.root.ownerDocument.activeElement).toBe(prepared);
    expect(mounted).toHaveBeenCalledOnce();
    expect(f.callsTo("accounts.list")).toHaveLength(1);
    expect(f.root.textContent).toContain("private-content one a");
    expect(f.root.querySelector("a")?.getAttribute("href")).toBe(
      "/movimientos/two",
    );
    await f.router.navigateByUrl("/movimientos/two?account=a");
    await f.settle();
    expect(f.root.textContent).toContain("private-content two a");
    expect(f.root.querySelector("workspace-loading")).toBeNull();
  });

  it("waits for a slow first read, not its default empty array, without adding another second", async () => {
    const f = await setup("ready");
    f.pending.resolve(PrivatePage);
    await f.settle(1_400);
    expect(f.root.querySelector("workspace-loading")).not.toBeNull();
    expect(f.callsTo("accounts.list")).toHaveLength(1);
    f.read.resolve([]);
    await f.settle();
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(mounted).toHaveBeenCalledOnce();
  });

  it("keeps an unresolved screen import behind the entrance animation", async () => {
    const f = await setup("ready");
    await f.settle(1_400);
    expect(f.root.querySelector("workspace-loading")).not.toBeNull();
    expect(
      f.root.querySelector(".workspace-preparing .workspace-page-skeleton"),
    ).not.toBeNull();
    f.pending.resolve(PrivatePage);
    f.read.resolve([]);
    await f.settle();
    expect(f.root.querySelector("workspace-loading")).toBeNull();
  });

  it("does not add a second after slow verification or replay it for internal navigation", async () => {
    const f = await setup();
    f.pending.resolve(PrivatePage);
    f.read.resolve([]);
    await f.settle(1_500);
    f.accept();
    await f.settle();
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    await f.router.navigateByUrl("/cuentas");
    await f.settle();
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(f.session.start).toHaveBeenCalledOnce();
  });

  it("animates every entry, including return with an already verified session", async () => {
    const f = await setup("ready");
    f.pending.resolve(PrivatePage);
    f.read.resolve([]);
    await f.settle(999);
    expect(f.root.querySelector("workspace-loading")).not.toBeNull();
    await f.settle(1);
    await f.router.navigateByUrl("/login");
    await f.router.navigateByUrl("/cuentas");
    await f.settle(999);
    expect(f.root.querySelector("workspace-loading")).not.toBeNull();
    expect(mounted).toHaveBeenCalledTimes(2);
    await f.settle(1);
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(f.callsTo("accounts.list")).toHaveLength(2);
  });

  it("reveals usable read errors and keeps subsequent reloads local to the page", async () => {
    const f = await setup("ready");
    f.pending.resolve(PrivatePage);
    f.read.resolve(rpcFailure());
    await f.settle(1_000);
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(f.root.textContent).toContain("Read failed");
    const retry = deferred<RpcOutput<"accounts.list">>();
    f.handlers["accounts.list"] = () => retry.promise;
    const button = f.root.querySelector<HTMLButtonElement>("button");
    button?.focus();
    button?.click();
    await f.settle();
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    retry.resolve([account("recovered")]);
    await f.settle();
    expect(f.root.textContent).toContain("recovered");
    expect(mounted).toHaveBeenCalledOnce();
    expect(f.root.ownerDocument.activeElement).toBe(button);
  });

  it("does not replay entrance or steal focus for a token refresh after reveal", async () => {
    const f = await setup("ready");
    f.pending.resolve(PrivatePage);
    f.read.resolve([]);
    await f.settle(1_000);
    const link = f.root.querySelector<HTMLAnchorElement>("a");
    link?.focus();
    const refresh = deferred<RpcOutput<"accounts.list">>();
    f.handlers["accounts.list"] = () => refresh.promise;
    f.credentials.accept(principal, "refreshed");
    await f.settle();
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(mounted).toHaveBeenCalledOnce();
    expect(f.root.ownerDocument.activeElement).toBe(link);
    refresh.resolve([]);
    await f.settle();
    expect(f.root.ownerDocument.activeElement).toBe(link);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows retryable authentication failures without redirecting or mounting private components", async () => {
    const f = await setup();
    f.session.status.set("error");
    f.session.error.set("Sin conexión");
    await f.settle(1_000);
    expect(f.root.textContent).toContain("Sin conexión");
    f.root.querySelector<HTMLButtonElement>("button")?.click();
    expect(f.session.retry).toHaveBeenCalledOnce();
    expect(f.router.url).toContain("/movimientos/one");
    expect(mounted).not.toHaveBeenCalled();
    f.accept();
    f.pending.resolve(PrivatePage);
    f.read.resolve([]);
    await f.settle();
    expect(f.root.querySelector("workspace-loading")).toBeNull();
  });

  it("redirects only resolved guests and preserves path, query and fragment", async () => {
    const f = await setup();
    f.session.status.set("anonymous");
    await f.settle(999);
    expect(f.router.url).toBe("/movimientos/one?account=a#activity");
    await f.settle(1);
    expect(f.router.url).toBe(
      "/login?redirect=%2Fmovimientos%2Fone%3Faccount%3Da%23activity",
    );
    expect(mounted).not.toHaveBeenCalled();
    expect(f.callsTo("accounts.list")).toHaveLength(0);
  });

  it("does not mount an unverified password account", async () => {
    const f = await setup("verification-required");
    f.pending.resolve(PrivatePage);
    await f.settle(1_000);
    expect(f.root.textContent).toContain("Verifica tu correo");
    expect(mounted).not.toHaveBeenCalled();
    expect(f.callsTo("accounts.list")).toHaveLength(0);
  });

  it("ignores completed imports after navigation destroys their owner", async () => {
    const f = await setup("ready");
    await f.settle();
    await f.router.navigateByUrl("/cuentas");
    f.read.resolve([account("current")]);
    await f.settle(1_000);
    f.pending.resolve(PrivatePage);
    await f.settle();
    expect(mounted).toHaveBeenCalledOnce();
    expect(f.root.textContent).toContain("current");
    expect(f.root.textContent).not.toContain("private-content one");
  });

  it("reveals import errors and retries the screen without repeating the entrance", async () => {
    const f = await setup("ready");
    f.pending.reject(new TypeError("Chunk unavailable"));
    await f.settle(1_000);
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(f.root.textContent).toContain("No pudimos cargar esta sección");
    f.load.mockResolvedValueOnce(PrivatePage);
    f.read.resolve([]);
    f.root.querySelector<HTMLButtonElement>("button")?.click();
    await f.settle();
    expect(f.load).toHaveBeenCalledTimes(2);
    expect(f.root.textContent).toContain("private-content one a");
    expect(f.router.url).toBe("/movimientos/one?account=a#activity");
  });

  it("removes private screens and aborts reads as soon as accepted credentials disappear", async () => {
    const f = await setup("ready");
    f.pending.resolve(PrivatePage);
    await f.settle();
    expect(mounted).toHaveBeenCalledOnce();
    f.credentials.clear();
    f.fixture.detectChanges();
    expect(f.root.querySelector(".verified-shell")).toBeNull();
    expect(f.callsTo("accounts.list")[0].options?.signal?.aborted).toBe(true);
    f.read.resolve([account("obsolete")]);
    await f.settle();
    expect(f.root.textContent).not.toContain("obsolete");
  });

  it("cancels old-owner preparation and gives a different owner a fresh entrance", async () => {
    const f = await setup("ready");
    f.pending.resolve(PrivatePage);
    await f.settle(900);
    f.handlers["accounts.list"] = () => [account("new owner")];
    f.credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    f.fixture.detectChanges();
    expect(f.root.querySelector(".workspace-preparing")).not.toBeNull();
    await f.settle(999);
    expect(f.root.querySelector("workspace-loading")).not.toBeNull();
    f.read.resolve([account("old secret")]);
    await f.settle(1);
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(f.root.textContent).toContain("new owner");
    expect(f.root.textContent).not.toContain("old secret");
    expect(mounted).toHaveBeenCalledTimes(2);
    expect(f.callsTo("accounts.list")[0].options?.signal?.aborted).toBe(true);
  });

  it("waits for the refreshed snapshot during entry without restarting its second", async () => {
    const f = await setup("ready");
    f.pending.resolve(PrivatePage);
    await f.settle(900);
    const refreshed = deferred<RpcOutput<"accounts.list">>();
    f.handlers["accounts.list"] = () => refreshed.promise;
    f.credentials.accept(principal, "refreshed");
    f.read.resolve([account("obsolete token")]);
    await f.settle(100);
    expect(f.root.querySelector("workspace-loading")).not.toBeNull();
    refreshed.resolve([account("refreshed")]);
    await f.settle();
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(f.root.textContent).toContain("refreshed");
    expect(f.root.textContent).not.toContain("obsolete token");
  });

  it("offers a bounded reload fallback for a screen without an explicit readiness declaration", async () => {
    const f = await setup("ready");
    f.pending.resolve(UnreportedPage);
    await f.settle(15_000);
    expect(f.root.querySelector("workspace-loading")?.textContent).toContain(
      "tardando más de lo esperado",
    );
    expect(f.root.querySelector("workspace-loading button")?.textContent).toBe(
      "Volver a cargar",
    );
  });

  it("recovers from the deadline when a slow read eventually finishes", async () => {
    const f = await setup("ready");
    f.pending.resolve(PrivatePage);
    await f.settle(15_000);
    expect(f.root.querySelector("workspace-loading")?.textContent).toContain(
      "tardando más de lo esperado",
    );
    f.read.resolve([]);
    await f.settle();
    expect(f.root.querySelector("workspace-loading")).toBeNull();
  });

  it("cancels both presentation timers and pending reads when leaving", async () => {
    const f = await setup("ready");
    f.pending.resolve(PrivatePage);
    await f.settle();
    expect(vi.getTimerCount()).toBe(2);
    await f.router.navigateByUrl("/login");
    await f.settle();
    expect(vi.getTimerCount()).toBe(0);
    expect(f.callsTo("accounts.list")[0].options?.signal?.aborted).toBe(true);
    f.read.resolve([]);
  });
});
