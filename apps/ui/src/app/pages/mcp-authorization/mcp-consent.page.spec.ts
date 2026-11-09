import { type ComponentFixture, TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { McpConsentSchema } from "@lazyfinance/contracts";
import { BehaviorSubject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import { principal } from "../../../testing/rpc";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { RPC_FETCH } from "../../core/rpc/rpc-client";
import { MCP_AUTH_NAVIGATE } from "../../features/mcp-authorization/oauth-interaction.client";
import { API_URL } from "../../tokens/api-url";
import { McpConsentPage } from "./mcp-consent.page";

const consent = McpConsentSchema.parse({
  id: "interaction-fixture",
  clientId: "https://client.example/client.json",
  clientName: "Cliente de prueba",
  redirectUri: "http://127.0.0.1:43219/callback",
  resource: "http://api.test/mcp",
  scopes: ["finance:read", "offline_access"],
  expiresAt: "2026-11-09T15:00:00.000Z",
});

function setup(
  overrides: Partial<{
    read: (options?: RequestInit) => Promise<Response>;
    write: (options?: RequestInit) => Promise<Response>;
  }> = {},
  authenticated = true,
) {
  const query = new BehaviorSubject(
    convertToParamMap({ interaction: consent.id }),
  );
  const read = overrides.read ?? (async () => Response.json(consent));
  const write =
    overrides.write ??
    (async () =>
      Response.json({
        redirectTo: "http://api.test/oauth/authorize/resume-fixture",
      }));
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, options) =>
    options?.method === "POST" ? write(options) : read(options),
  );
  const navigate = vi.fn<(url: string) => void>();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: query.asObservable() },
      },
      { provide: API_URL, useValue: "http://api.test" },
      { provide: RPC_FETCH, useValue: fetch },
      { provide: MCP_AUTH_NAVIGATE, useValue: navigate },
    ],
  });
  const credentials = TestBed.inject(AuthCredentials);
  if (authenticated) credentials.accept(principal, "alice");
  const fixture = TestBed.createComponent(McpConsentPage);
  return {
    fixture,
    root: fixture.nativeElement as HTMLElement,
    query,
    credentials,
    fetch,
    navigate,
  };
}

async function render(fixture: ComponentFixture<McpConsentPage>) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}
const button = (root: HTMLElement, text: string) => {
  const found = [...root.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
};

describe("owned external-client consent and obsolete interaction results", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it("waits for verified app credentials, previews without approving and discloses real client/callback permissions", async () => {
    const f = setup({}, false);
    await render(f.fixture);
    expect(f.fetch).not.toHaveBeenCalled();
    f.credentials.accept(principal, "alice");
    await render(f.fixture);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const options = f.fetch.mock.calls[0][1];
    expect(options?.credentials).toBe("include");
    expect(new Headers(options?.headers).get("authorization")).toBe(
      "Bearer alice",
    );
    expect(f.root.textContent).toContain("Cliente de prueba");
    expect(f.root.textContent).toContain("127.0.0.1:43219");
    expect(f.root.textContent).toContain(principal.email);
    expect(f.root.textContent).toContain("No puede editar tus datos");
    expect(f.navigate).not.toHaveBeenCalled();
  });

  it("suppresses duplicate approval and navigates only after confirmation to the fixed issuer resume path", async () => {
    const pending = deferred<Response>(),
      f = setup({ write: () => pending.promise });
    await render(f.fixture);
    const approve = button(f.root, "Autorizar solo lectura");
    approve.click();
    approve.click();
    await vi.waitFor(() =>
      expect(
        f.fetch.mock.calls.filter(([, options]) => options?.method === "POST"),
      ).toHaveLength(1),
    );
    expect(f.navigate).not.toHaveBeenCalled();
    pending.resolve(
      Response.json({
        redirectTo: "http://api.test/oauth/authorize/resume-fixture",
      }),
    );
    await render(f.fixture);
    expect(f.navigate).toHaveBeenCalledExactlyOnceWith(
      "http://api.test/oauth/authorize/resume-fixture",
    );
    expect(JSON.parse(String(f.fetch.mock.calls[1][1]?.body))).toEqual({
      approve: true,
    });
  });

  it("denies only on an explicit action and never automatically replays a failed decision", async () => {
    const f = setup({ write: async () => new Response("", { status: 503 }) });
    await render(f.fixture);
    button(f.root, "No autorizar y regresar").click();
    await render(f.fixture);
    expect(JSON.parse(String(f.fetch.mock.calls[1][1]?.body))).toEqual({
      approve: false,
    });
    expect(f.root.textContent).toContain("No repetiremos esta decisión");
    expect(button(f.root, "Autorizar solo lectura").disabled).toBe(true);
    expect(f.navigate).not.toHaveBeenCalled();
    button(f.root, "No autorizar y regresar").click();
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects a foreign redirect and a mismatched preview rather than trusting HTTP success", async () => {
    const f = setup({
      write: async () =>
        Response.json({
          redirectTo: "https://evil.example/oauth/authorize/steal",
        }),
    });
    await render(f.fixture);
    button(f.root, "Autorizar solo lectura").click();
    await render(f.fixture);
    expect(f.navigate).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    const g = setup({
      read: async () => Response.json({ ...consent, id: "other-request" }),
    });
    await render(g.fixture);
    expect(g.root.textContent).toContain("No pudimos comprobar");
    expect(g.root.textContent).not.toContain("Cliente de prueba");
  });

  it("cancels pending consent on logout and discards its redirect after another owner signs in", async () => {
    const pending = deferred<Response>(),
      f = setup({ write: () => pending.promise });
    await render(f.fixture);
    button(f.root, "Autorizar solo lectura").click();
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(2));
    f.credentials.clear();
    f.fixture.detectChanges();
    expect(f.fetch.mock.calls[1][1]?.signal?.aborted).toBe(true);
    f.credentials.accept(
      { ...principal, userId: "owner-b", email: "bob@example.test" },
      "bob",
    );
    pending.resolve(
      Response.json({ redirectTo: "http://api.test/oauth/authorize/obsolete" }),
    );
    await render(f.fixture);
    expect(f.navigate).not.toHaveBeenCalled();
    expect(f.root.textContent).toContain("bob@example.test");
    expect(f.root.textContent).not.toContain(principal.email);
  });

  it("does not fetch an invalid interaction and does not expire a newer login for an obsolete 401", async () => {
    const old = deferred<Response>();
    let reads = 0;
    const f = setup({
      read: () =>
        ++reads === 1 ? old.promise : Promise.resolve(Response.json(consent)),
    });
    f.fixture.detectChanges();
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(1));
    f.credentials.accept(principal, "new-token");
    old.resolve(new Response("", { status: 401 }));
    await render(f.fixture);
    expect(f.credentials.current()?.token).toBe("new-token");
    f.query.next(convertToParamMap({ interaction: "../../steal" }));
    await render(f.fixture);
    expect(f.root.textContent).toContain("La solicitud no es válida");
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });
});
