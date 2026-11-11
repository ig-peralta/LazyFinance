import { type ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../testing/deferred";
import {
  principal,
  type RpcHandlers,
  type RpcOutput,
  rpcFailure,
  setupRpc,
} from "../../../testing/rpc";
import { McpGrantsPage } from "./mcp-grants.page";

const grant: RpcOutput<"mcpAccess.grants">[number] = {
  id: "grant-fixture",
  clientId: "https://client.example/client.json",
  clientName: "Cliente externo",
  redirectUri: "https://client.example/callback",
  resource: "https://api.example/mcp",
  scopes: ["finance:read"],
  createdAt: "2026-11-08T15:00:00.000Z",
  expiresAt: "2026-12-08T15:00:00.000Z",
  revokedAt: null,
};
function setup(overrides: RpcHandlers = {}) {
  let grants = [grant];
  const mock = setupRpc({
    "mcpAccess.configuration": () => ({ enabled: true }),
    "mcpAccess.grants": () => grants,
    "mcpAccess.revoke": () => {
      grants = [{ ...grant, revokedAt: "2026-11-08T18:00:00.000Z" }];
      return { revoked: true };
    },
    ...overrides,
  });
  const fixture = TestBed.createComponent(McpGrantsPage);
  return { ...mock, fixture, root: fixture.nativeElement as HTMLElement };
}
async function render(fixture: ComponentFixture<McpGrantsPage>) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}
const button = (root: HTMLElement, label: string) => {
  const found = [...root.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
};

describe("owned external-client access management", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it("discloses disabled issuance without preventing revocation of retained grants", async () => {
    const f = setup({ "mcpAccess.configuration": () => ({ enabled: false }) });
    await render(f.fixture);
    expect(f.root.textContent).toContain(
      "Las nuevas conexiones externas no están habilitadas",
    );
    expect(button(f.root, "Quitar acceso").disabled).toBe(false);
    expect(f.callsTo("mcpAccess.revoke")).toHaveLength(0);
  });

  it("lists confirmed grants without writes and revokes only after explicit confirmation", async () => {
    const f = setup();
    await render(f.fixture);
    expect(f.root.querySelector(".page-header h1")?.textContent).toBe(
      "Aplicaciones conectadas",
    );
    const explanation = f.root.querySelector("details");
    expect(explanation?.open).toBe(false);
    if (explanation) explanation.open = true;
    await render(f.fixture);
    expect(f.root.textContent).toContain("Cliente externo");
    expect(f.root.textContent).toContain(grant.redirectUri);
    expect(f.root.textContent).toContain("finance:read");
    expect(f.root.textContent).toContain("Identidad no verificada");
    expect(f.callsTo("mcpAccess.revoke")).toHaveLength(0);
    button(f.root, "Quitar acceso").click();
    await render(f.fixture);
    const confirmation = f.root.querySelector('[role="group"]');
    expect(confirmation?.textContent).toContain(grant.clientId);
    expect(confirmation?.textContent).toContain("no borra copias ya recibidas");
    button(f.root, "Cancelar").click();
    await render(f.fixture);
    expect(f.callsTo("mcpAccess.revoke")).toHaveLength(0);
    button(f.root, "Quitar acceso").click();
    await render(f.fixture);
    button(f.root, "Sí, quitar acceso").click();
    await render(f.fixture);
    expect(f.callsTo("mcpAccess.revoke")[0].input).toEqual({ id: grant.id });
    expect(f.root.textContent).toContain("Acceso revocado el");
    expect(f.callsTo("banking.disconnect")).toHaveLength(0);
  });

  it("distinguishes expired, revoked, empty and multiple connections without merging their identities", async () => {
    const f = setup({
      "mcpAccess.grants": () => [
        { ...grant, expiresAt: "2020-01-01T00:00:00.000Z" },
        {
          ...grant,
          id: "other-grant",
          clientId: "other-client",
          clientName: "Mismo nombre",
          redirectUri: null,
          revokedAt: "2026-11-08T18:00:00.000Z",
        },
      ],
    });
    await render(f.fixture);
    expect(f.root.textContent).toContain("Vencido");
    expect(f.root.textContent).toContain("Revocado");
    expect(f.root.textContent).toContain(
      "No registrado para este acceso anterior",
    );
    expect(f.root.querySelectorAll("mcp-client-identity")).toHaveLength(2);
    expect(
      [...f.root.querySelectorAll("button")].filter(
        (b) => b.textContent?.trim() === "Quitar acceso",
      ),
    ).toHaveLength(1);
    f.handlers["mcpAccess.grants"] = () => [];
    button(f.root, "Actualizar").click();
    await render(f.fixture);
    expect(f.root.textContent).toContain(
      "Aún no tienes aplicaciones conectadas",
    );
  });

  it("keeps revoke locked after a failed reconciliation and unlocks only after a successful explicit later read", async () => {
    const f = setup({ "mcpAccess.revoke": () => rpcFailure() });
    await render(f.fixture);
    button(f.root, "Quitar acceso").click();
    await render(f.fixture);
    button(f.root, "Sí, quitar acceso").click();
    await render(f.fixture);
    f.handlers["mcpAccess.grants"] = () => rpcFailure();
    button(f.root, "Actualizar").click();
    await render(f.fixture);
    expect(f.root.textContent).toContain("Actualiza la lista antes");
    f.handlers["mcpAccess.grants"] = () => [
      { ...grant, revokedAt: "2026-11-08T18:00:00.000Z" },
    ];
    button(f.root, "Actualizar").click();
    await render(f.fixture);
    expect(f.root.textContent).not.toContain("Actualiza la lista antes");
    expect(f.root.textContent).toContain("Acceso revocado el");
    expect(f.callsTo("mcpAccess.revoke")).toHaveLength(1);
  });

  it("does not describe a failed read or uncertain revoke as an empty/revoked grant", async () => {
    const f = setup({ "mcpAccess.revoke": () => rpcFailure() });
    await render(f.fixture);
    button(f.root, "Quitar acceso").click();
    await render(f.fixture);
    button(f.root, "Sí, quitar acceso").click();
    await render(f.fixture);
    expect(f.root.textContent).toContain("Actualiza la lista antes");
    expect(f.root.textContent).not.toContain("Acceso revocado el");
    expect(f.callsTo("mcpAccess.revoke")).toHaveLength(1);
    f.handlers["mcpAccess.grants"] = () => rpcFailure();
    button(f.root, "Actualizar").click();
    await render(f.fixture);
    expect(f.root.textContent).toContain("No pudimos consultar tus accesos");
    expect(f.root.textContent).not.toContain(
      "Aún no tienes aplicaciones conectadas",
    );
  });

  it("discards an old owner's pending revocation and data after credentials change", async () => {
    const old = deferred<RpcOutput<"mcpAccess.revoke">>(),
      f = setup({ "mcpAccess.revoke": () => old.promise });
    await render(f.fixture);
    button(f.root, "Quitar acceso").click();
    await render(f.fixture);
    button(f.root, "Sí, quitar acceso").click();
    await vi.waitFor(() =>
      expect(f.callsTo("mcpAccess.revoke")).toHaveLength(1),
    );
    f.credentials.clear();
    f.fixture.detectChanges();
    expect(f.callsTo("mcpAccess.revoke")[0].options?.signal?.aborted).toBe(
      true,
    );
    f.handlers["mcpAccess.grants"] = () => [];
    f.credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    old.resolve({ revoked: true });
    await render(f.fixture);
    expect(f.root.textContent).not.toContain("Cliente externo");
    expect(f.root.textContent).not.toContain("Acceso retirado.");
  });

  it("leads with readable permissions and keeps technical identity, scopes and timestamps in closed details", async () => {
    const f = setup();
    await render(f.fixture);
    const card = f.root.querySelector(".grant-card");
    expect(card?.querySelector("details")?.open).toBe(false);
    expect(card?.querySelector("details")?.textContent).toContain(
      grant.clientId,
    );
    expect(card?.querySelector("details")?.textContent).toContain(
      "finance:read",
    );
    expect(card?.querySelector(".grant-capabilities")?.textContent).toContain(
      "Solo lectura",
    );
    expect(card?.querySelector(".grant-permissions")?.textContent).toContain(
      "Consultar tus finanzas",
    );
    expect(
      card?.querySelector(".grant-capabilities")?.textContent,
    ).not.toContain("finance:read");
    expect(f.callsTo("mcpAccess.revoke")).toHaveLength(0);
  });

  it("shows only actually granted financial capabilities in the readable list", async () => {
    const f = setup({
      "mcpAccess.grants": () => [
        {
          ...grant,
          scopes: [
            "finance:read",
            "finance:tags:write",
            "openid",
            "offline_access",
          ],
        },
      ],
    });
    await render(f.fixture);
    const summary = f.root.querySelector(".grant-capabilities");
    expect(summary?.textContent).toContain("Lectura y cambios");
    expect(summary?.textContent).toContain(
      "Crear, editar y archivar etiquetas",
    );
    expect(summary?.textContent).not.toContain("Crear presupuestos");
    expect(f.root.querySelectorAll(".grant-permissions li")).toHaveLength(2);
    expect(f.root.querySelector(".grant-details")?.textContent).toContain(
      "openid, offline_access",
    );
  });
});
