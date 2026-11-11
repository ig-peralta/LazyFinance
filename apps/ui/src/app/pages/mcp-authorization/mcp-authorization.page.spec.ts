import { PLATFORM_ID, type Provider } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import type { User as FirebaseUser } from "firebase/auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import { firebaseUser } from "../../../testing/firebase";
import {
  createRpcFetch,
  principal,
  type RpcHandlers,
} from "../../../testing/rpc";
import { App } from "../../app";
import { routes } from "../../app.routes";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { SessionService } from "../../core/auth/session.service";
import { RPC_FETCH } from "../../core/rpc/rpc-client";
import { MCP_AUTH_NAVIGATE } from "../../features/mcp-authorization/oauth-interaction.client";
import { FirebaseService } from "../../services/firebase/firebase.service";
import { API_URL } from "../../tokens/api-url";

const request = {
  id: "connection-a",
  clientId: "https://opencode.ai/oauth/opencode/client.json",
  clientName: "OpenCode",
  redirectUri: "http://127.0.0.1:43219/callback",
  resource: "http://api.test/mcp",
  scopes: ["finance:read", "finance:tags:write"],
  expiresAt: "2099-11-11T15:00:00.000Z",
};

async function setup({
  authenticated = false,
  handlers = {},
  preview,
  providers = [],
}: {
  authenticated?: boolean;
  handlers?: RpcHandlers;
  preview?: (url: string, options?: RequestInit) => Promise<Response>;
  providers?: Provider[];
} = {}) {
  const rpc = createRpcFetch(handlers);
  const interaction = vi.fn<typeof globalThis.fetch>(async (url, options) => {
    const path = String(url);
    if (preview) return preview(path, options);
    if (options?.method === "POST")
      return Response.json({
        redirectTo: "http://api.test/oauth/authorize/resume-connection-a",
      });
    return Response.json({ ...request, id: path.split("/").at(-2) });
  });
  const fetch = vi.fn<typeof globalThis.fetch>((url, options) =>
    String(url).includes("/oauth/interaction/")
      ? interaction(url, options)
      : rpc.fetch(url, options),
  );
  const callback = vi.fn<(url: string) => void>();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      { provide: PLATFORM_ID, useValue: "browser" },
      { provide: API_URL, useValue: "http://api.test" },
      { provide: RPC_FETCH, useValue: fetch },
      { provide: MCP_AUTH_NAVIGATE, useValue: callback },
      ...providers,
    ],
  });
  if (authenticated) TestBed.inject(AuthCredentials).accept(principal, "alice");
  const fixture = TestBed.createComponent(App);
  fixture.detectChanges();
  const root: HTMLElement = fixture.nativeElement;
  const router = TestBed.inject(Router);
  const settle = async () => {
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(TestBed.inject(SessionService).isResolving()).toBe(false);
      expect(
        root.querySelector<HTMLButtonElement>('[data-testid="mock-login"]')
          ?.disabled ?? false,
      ).toBe(false);
    });
    for (let turn = 0; turn < 3; turn++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    fixture.detectChanges();
  };
  const enter = async (path = "/autorizar-mcp?interaction=connection-a") => {
    await router.navigateByUrl(path);
    await settle();
  };
  return {
    ...rpc,
    interaction,
    callback,
    fixture,
    root,
    router,
    settle,
    enter,
  };
}

function button(root: HTMLElement, text: string) {
  const found = [...root.querySelectorAll("button")].find(
    (node) => node.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function setupFirebase() {
  const account = firebaseUser("firebase-a", "firebase-token");
  let observe: (user: FirebaseUser | null) => void = () => {};
  let beforeChange: (user: FirebaseUser | null) => void = () => {};
  const auth = {
    currentUser: null as FirebaseUser | null,
    authStateReady: async () => {},
    beforeAuthStateChanged: (listener: typeof beforeChange) => {
      beforeChange = listener;
      return () => {};
    },
    onIdTokenChanged: (listener: typeof observe) => {
      observe = listener;
      queueMicrotask(() => listener(auth.currentUser));
      return () => {};
    },
  };
  const install = (user: FirebaseUser | null) => {
    beforeChange(user);
    auth.currentUser = user;
    observe(user);
    return user;
  };
  const firebase = {
    init: async () => auth,
    auth: () => auth,
    signInWithGoogle: vi.fn<FirebaseService["signInWithGoogle"]>(async () => {
      install(account.user);
      return account.user;
    }),
    signInWithPassword: vi.fn<FirebaseService["signInWithPassword"]>(
      async () => {
        install(account.user);
        return account.user;
      },
    ),
    createPasswordAccount: vi.fn<FirebaseService["createPasswordAccount"]>(
      async () => {
        account.user.emailVerified = false;
        account.setProviders(["password"]);
        install(account.user);
        return account.user;
      },
    ),
    sendVerification: vi.fn<FirebaseService["sendVerification"]>(
      async (user) => user,
    ),
    reloadUser: vi.fn<FirebaseService["reloadUser"]>(async (user) => user),
    resetPassword: vi.fn<FirebaseService["resetPassword"]>(async () => {}),
    signOut: vi.fn<FirebaseService["signOut"]>(async () => {
      install(null);
    }),
  };
  const f = await setup({
    handlers: { "auth.config": () => ({ provider: "firebase" }) },
    providers: [{ provide: FirebaseService, useValue: firebase }],
  });
  return { ...f, account, firebase, install };
}

describe("single-page MCP connection without the financial workspace", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.removeItem("lazyfinance-mock-token");
    vi.restoreAllMocks();
  });

  it("exposes one canonical MCP connection route outside the workspace", () => {
    expect(
      routes
        .filter((route) => route.path?.includes("mcp"))
        .map((route) => route.path),
    ).toEqual(["autorizar-mcp"]);
    const workspace = routes.find((route) => route.component && route.children);
    expect(
      workspace?.children
        ?.flatMap((route) => route.children ?? [])
        .some((route) => route.path?.includes("mcp")),
    ).toBe(false);
  });

  it("takes a signed-out user directly to a purpose-specific login with no private reads or approval", async () => {
    const f = await setup();
    await f.enter();
    expect(f.router.url).toBe("/autorizar-mcp?interaction=connection-a");
    expect(f.root.querySelector("h1")?.textContent).toContain(
      "Inicia sesión para conectar una aplicación",
    );
    expect(f.root.textContent).toContain("no autoriza a la aplicación");
    expect(f.root.querySelector("aside")).toBeNull();
    expect(f.root.querySelector("app-shell")).toBeNull();
    expect(f.root.querySelector("workspace-loading")).toBeNull();
    expect(f.interaction).not.toHaveBeenCalled();
    expect(f.calls.every((call) => call.procedure.startsWith("auth."))).toBe(
      true,
    );
  });

  it("logs in and previews permissions in place on the same request without approving", async () => {
    const f = await setup();
    await f.enter();
    const password = f.root.querySelector<HTMLInputElement>("#password");
    if (!password) throw new Error("Missing MCP sign-in form");
    password.value = "password";
    button(f.root, "Iniciar sesión y revisar permisos").click();
    await f.settle();
    expect(f.router.url).toBe("/autorizar-mcp?interaction=connection-a");
    expect(f.root.textContent).toContain("Conectar aplicación");
    expect(f.root.querySelector("login-page")).toBeNull();
    expect(f.root.textContent).toContain(principal.email);
    expect(f.root.textContent).toContain("OpenCode");
    expect(
      f.root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(false);
    expect(f.interaction).toHaveBeenCalledTimes(1);
    expect(f.interaction.mock.calls[0][1]?.credentials).toBe("include");
    expect(f.callback).not.toHaveBeenCalled();
    expect(f.calls.every((call) => call.procedure.startsWith("auth."))).toBe(
      true,
    );
  });

  it("skips login for an accepted account, but still waits for explicit consent", async () => {
    const f = await setup({ authenticated: true });
    await f.enter();
    expect(f.router.url).toBe("/autorizar-mcp?interaction=connection-a");
    expect(f.root.querySelector("login-page")).toBeNull();
    expect(f.root.querySelector("app-shell")).toBeNull();
    expect(f.callsTo("onboarding.state")).toHaveLength(0);
    expect(f.interaction).toHaveBeenCalledTimes(1);
    button(f.root, "Autorizar solo lectura").click();
    await f.settle();
    expect(JSON.parse(String(f.interaction.mock.calls[1][1]?.body))).toEqual({
      approve: true,
    });
    expect(f.callback).toHaveBeenCalledExactlyOnceWith(
      "http://api.test/oauth/authorize/resume-connection-a",
    );
  });

  it("switches account without losing the request or silently selecting optional permissions", async () => {
    const f = await setup({ authenticated: true });
    await f.enter();
    f.root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    await f.settle();
    button(f.root, "Usar otra cuenta").click();
    await f.settle();
    expect(f.router.url).toBe("/autorizar-mcp?interaction=connection-a");
    expect(f.root.querySelector("#password")).not.toBeNull();
    expect(
      f.interaction.mock.calls.some(
        ([, options]) => options?.method === "POST",
      ),
    ).toBe(false);
    expect(f.root.textContent).toContain("no autoriza a la aplicación");
    expect(f.root.textContent).not.toContain(principal.email);
  });

  it.each([
    "/autorizar-mcp",
    "/autorizar-mcp?interaction=%3Cscript%3E",
    "/autorizar-mcp?interaction=..%2Fbad",
  ])("rejects an invalid request before sign-in or consent on %s", async (path) => {
    const f = await setup();
    await f.enter(path);
    expect(f.root.textContent).toContain("No hay una conexión válida");
    expect(f.root.querySelector("form")).toBeNull();
    expect(f.interaction).not.toHaveBeenCalled();
    expect(f.callsTo("auth.loginMock")).toHaveLength(0);
  });

  it("ignores a caller-supplied redirect and cannot leave the MCP flow after login", async () => {
    const f = await setup();
    await f.enter(
      "/autorizar-mcp?interaction=connection-a&redirect=https://evil.example/steal",
    );
    const originalUrl = f.router.url;
    const password = f.root.querySelector<HTMLInputElement>("#password");
    if (!password) throw new Error("Missing MCP sign-in");
    password.value = "password";
    button(f.root, "Iniciar sesión y revisar permisos").click();
    await f.settle();
    expect(f.router.url).toBe(originalUrl);
    expect(f.root.querySelector("mcp-consent-page")).not.toBeNull();
    expect(f.callback).not.toHaveBeenCalled();
  });

  it.each([
    "google",
    "password",
  ] as const)("settles Firebase %s authentication before replacing sign-in with consent", async (method) => {
    const f = await setupFirebase();
    await f.enter();
    if (method === "google") {
      button(f.root, "Google · continuar a permisos").click();
    } else {
      const email = f.root.querySelector<HTMLInputElement>("#firebase-email");
      const password =
        f.root.querySelector<HTMLInputElement>("#firebase-password");
      if (!email || !password) throw new Error("Missing Firebase sign-in form");
      email.value = "person@example.test";
      password.value = "test-password";
      button(f.root, "Iniciar sesión y revisar permisos").click();
    }
    await f.settle();
    expect(TestBed.inject(SessionService).active()).toBe(true);
    expect(f.firebase.signOut).not.toHaveBeenCalled();
    expect(f.root.querySelector("login-page")).toBeNull();
    expect(f.root.textContent).toContain("Conectar aplicación");
    expect(f.router.url).toBe("/autorizar-mcp?interaction=connection-a");
    expect(f.interaction).toHaveBeenCalledTimes(1);
    expect(f.callback).not.toHaveBeenCalled();
  });

  it("keeps password recovery, registration and email verification on the same connection page", async () => {
    const f = await setupFirebase();
    await f.enter();
    const email = f.root.querySelector<HTMLInputElement>("#firebase-email");
    const password =
      f.root.querySelector<HTMLInputElement>("#firebase-password");
    const confirmation = f.root.querySelector<HTMLInputElement>(
      "#firebase-confirmation",
    );
    if (!email || !password || !confirmation)
      throw new Error("Missing Firebase form");
    email.value = "person@example.test";
    button(f.root, "Olvidé mi contraseña").click();
    await f.settle();
    expect(f.firebase.resetPassword).toHaveBeenCalledExactlyOnceWith(
      email.value,
    );
    expect(f.root.textContent).toContain("Si la cuenta admite contraseña");
    button(f.root, "Crear cuenta con correo").click();
    f.fixture.detectChanges();
    password.value = confirmation.value = "test-password";
    button(f.root, "Crear cuenta").click();
    await f.settle();
    expect(password.value).toBe("");
    expect(confirmation.value).toBe("");
    expect(f.root.textContent).toContain("Verifica tu correo");
    expect(TestBed.inject(SessionService).active()).toBe(false);
    expect(f.interaction).not.toHaveBeenCalled();
    expect(f.callsTo("auth.principal")).toHaveLength(0);
    button(f.root, "Reenviar verificación").click();
    await f.settle();
    expect(f.firebase.sendVerification).toHaveBeenCalledTimes(2);
    f.account.user.emailVerified = true;
    button(f.root, "Ya verifiqué mi correo").click();
    await f.settle();
    expect(f.firebase.reloadUser).toHaveBeenCalledOnce();
    expect(f.firebase.signOut).not.toHaveBeenCalled();
    expect(f.root.querySelector("mcp-consent-page")).not.toBeNull();
    expect(f.router.url).toBe("/autorizar-mcp?interaction=connection-a");
    expect(f.callback).not.toHaveBeenCalled();
    expect(f.calls.every((call) => call.procedure.startsWith("auth."))).toBe(
      true,
    );
  });

  it("waits for Firebase logout before exposing another sign-in on the same URL", async () => {
    const f = await setupFirebase();
    await f.enter();
    button(f.root, "Google · continuar a permisos").click();
    await f.settle();
    const pending = deferred<void>();
    f.firebase.signOut.mockImplementationOnce(async () => {
      await pending.promise;
      f.install(null);
    });
    button(f.root, "Usar otra cuenta").click();
    f.fixture.detectChanges();
    expect(f.root.textContent).toContain("Cambiando de cuenta");
    expect(f.root.querySelector("login-page")).toBeNull();
    expect(f.root.querySelector("mcp-consent-page")).toBeNull();
    pending.resolve();
    await f.settle();
    expect(f.root.querySelector("#firebase-password")).not.toBeNull();
    expect(f.router.url).toBe("/autorizar-mcp?interaction=connection-a");
    expect(f.interaction).toHaveBeenCalledTimes(1);
    expect(f.callback).not.toHaveBeenCalled();
  });

  it("cleans up a late Firebase popup after the interaction replaces its form", async () => {
    const f = await setupFirebase();
    const pending = deferred<void>();
    f.firebase.signInWithGoogle.mockImplementationOnce(async () => {
      await pending.promise;
      f.install(f.account.user);
      return f.account.user;
    });
    await f.enter();
    button(f.root, "Google · continuar a permisos").click();
    await vi.waitFor(() =>
      expect(f.firebase.signInWithGoogle).toHaveBeenCalledOnce(),
    );
    await f.router.navigateByUrl("/autorizar-mcp?interaction=connection-b");
    f.fixture.detectChanges();
    pending.resolve();
    await f.settle();
    expect(f.firebase.signOut).toHaveBeenCalled();
    expect(TestBed.inject(SessionService).active()).toBe(false);
    expect(f.callsTo("auth.principal")).toHaveLength(0);
    expect(f.interaction).not.toHaveBeenCalled();
    expect(f.router.url).toBe("/autorizar-mcp?interaction=connection-b");
    expect(
      f.root.querySelector<HTMLInputElement>("#firebase-password")?.value,
    ).toBe("");
  });

  it("destroys a pending login when the interaction changes and ignores its late completion", async () => {
    const pending = deferred<{ token: string }>();
    const f = await setup({
      handlers: { "auth.loginMock": () => pending.promise },
    });
    await f.enter("/autorizar-mcp?interaction=connection-a");
    const password = f.root.querySelector<HTMLInputElement>("#password");
    if (!password) throw new Error("Missing MCP sign-in");
    password.value = "password";
    button(f.root, "Iniciar sesión y revisar permisos").click();
    await vi.waitFor(() => expect(f.callsTo("auth.loginMock")).toHaveLength(1));
    await f.router.navigateByUrl("/autorizar-mcp?interaction=connection-b");
    f.fixture.detectChanges();
    expect(f.callsTo("auth.loginMock")[0].options?.signal?.aborted).toBe(true);
    pending.resolve({ token: "late-token" });
    await f.settle();
    expect(f.router.url).toBe("/autorizar-mcp?interaction=connection-b");
    expect(f.root.querySelector<HTMLInputElement>("#password")?.value).toBe("");
    expect(f.callsTo("auth.principal")).toHaveLength(0);
    expect(f.interaction).not.toHaveBeenCalled();
  });

  it("keeps an unavailable or foreign cookie-bound request unapproved", async () => {
    const f = await setup({
      authenticated: true,
      preview: async () => new Response("", { status: 404 }),
    });
    await f.enter();
    expect(f.root.textContent).toContain("No pudimos comprobar la solicitud");
    expect(f.root.textContent).not.toContain("OpenCode");
    expect(f.root.querySelector("button.button.primary")).toBeNull();
    expect(f.callback).not.toHaveBeenCalled();
  });

  it("destroys an obsolete consent command and never follows its late redirect", async () => {
    const pending = deferred<Response>();
    const f = await setup({
      authenticated: true,
      preview: async (url, options) =>
        options?.method === "POST"
          ? pending.promise
          : Response.json({ ...request, id: url.split("/").at(-2) }),
    });
    await f.enter();
    button(f.root, "Autorizar solo lectura").click();
    await vi.waitFor(() => expect(f.interaction).toHaveBeenCalledTimes(2));
    await f.router.navigateByUrl("/autorizar-mcp?interaction=connection-b");
    f.fixture.detectChanges();
    expect(f.interaction.mock.calls[1][1]?.signal?.aborted).toBe(true);
    pending.resolve(
      Response.json({
        redirectTo: "http://api.test/oauth/authorize/resume-connection-a",
      }),
    );
    await f.settle();
    expect(
      f.root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(false);
    expect(f.callback).not.toHaveBeenCalled();
    expect(f.router.url).toBe("/autorizar-mcp?interaction=connection-b");
  });

  it("does not resume authorization after a failed account switch until logout is reconciled", async () => {
    const f = await setup({ authenticated: true });
    await f.enter();
    const session = TestBed.inject(SessionService);
    const logout = vi
      .spyOn(session, "logout")
      .mockImplementationOnce(async () => {
        TestBed.inject(AuthCredentials).clear();
        throw new Error("Provider logout failed");
      });
    button(f.root, "Usar otra cuenta").click();
    await f.settle();
    expect(f.router.url).toBe("/autorizar-mcp?interaction=connection-a");
    expect(f.root.textContent).toContain("No pudimos cambiar de cuenta");
    expect(f.root.querySelector("mcp-consent-page")).toBeNull();
    expect(f.callback).not.toHaveBeenCalled();
    logout.mockRestore();
    button(f.root, "Volver a cerrar sesión").click();
    await f.settle();
    expect(f.router.url).toBe("/autorizar-mcp?interaction=connection-a");
    expect(
      f.interaction.mock.calls.some(
        ([, options]) => options?.method === "POST",
      ),
    ).toBe(false);
  });
});
