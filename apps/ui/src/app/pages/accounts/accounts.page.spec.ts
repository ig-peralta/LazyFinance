import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bankingConnection,
  bankingImportResult,
  bankingSyncStatus,
} from "../../../testing/banking";
import { deferred } from "../../../testing/deferred";
import {
  account,
  principal,
  type RpcOutput,
  rpcFailure,
  setupRpc,
} from "../../../testing/rpc";
import { SessionService } from "../../core/auth/session.service";
import { AccountsPage } from "./accounts.page";

describe("truthful stored account status", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("distinguishes unknown balances, card debt and old observations without inventing connection states", async () => {
    const mock = setupRpc({
      "accounts.list": (_input, call) =>
        call.authorization === "Bearer bob"
          ? []
          : [
              {
                ...account("00000000-0000-4000-8000-000000000081"),
                alias: "Cuenta sin saldo",
                balance: null,
              },
              {
                ...account("00000000-0000-4000-8000-000000000082"),
                alias: "Tarjeta",
                type: "credit_card",
                balance: "-9007199254740.99",
                lastSyncedAt: "2020-01-01T15:00:00.000Z",
              },
            ],
    });
    const fixture = TestBed.createComponent(AccountsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector("h1")?.textContent).toContain("Cuentas");
    const disclosure = root.querySelector("details");
    expect(disclosure?.open).toBe(false);
    expect(disclosure?.querySelector("summary")?.textContent).toBe(
      "Sobre estos saldos",
    );
    expect(disclosure?.textContent).toContain(
      "no solicita una actualización al banco",
    );
    expect(root.textContent).toContain("Saldo no disponible");
    expect(root.textContent).toContain("Saldo adeudado");
    expect(root.textContent).toContain("$9.007.199.254.740,99");
    expect(root.textContent).toContain("Registro anterior a 24 horas");
    expect(
      [...root.querySelectorAll("button")].filter((button) => button.disabled),
    ).toHaveLength(0);
    expect(root.textContent).toContain("independientes del acceso bancario");
    expect(
      root.querySelector('a[href="/conexiones-bancarias"]')?.textContent,
    ).toContain("Conectar banco");
    expect(root.querySelector("bank-link-flow")).toBeNull();
    expect(root.textContent).not.toContain("Tus conexiones bancarias");
    expect(
      root
        .querySelector<HTMLAnchorElement>('a[href^="/movimientos"]')
        ?.getAttribute("href"),
    ).toContain("account=");
    mock.credentials.accept({ ...principal, userId: "bob" }, "bob");
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).not.toContain("Cuenta sin saldo");
    expect(root.textContent).toContain("No hay cuentas activas");
    expect(mock.calls.every((call) => call.procedure === "accounts.list")).toBe(
      true,
    );
  });

  it("keeps failed reads distinct from a zero or a successful empty import", async () => {
    const mock = setupRpc({ "accounts.list": () => rpcFailure() });
    const fixture = TestBed.createComponent(AccountsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "No significa saldo cero ni importación vacía",
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      "No hay cuentas activas",
    );
    expect(
      fixture.nativeElement.querySelector('a[href="/conexiones-bancarias"]'),
    ).not.toBeNull();
    fixture.nativeElement.querySelector(".notice.danger button").click();
    await fixture.whenStable();
    expect(mock.callsTo("accounts.list")).toHaveLength(2);
    expect(mock.callsTo("banking.connections")).toHaveLength(0);
  });

  it("starts one Banco Demo refresh on click and reads balances again only after the commit", async () => {
    const reply = deferred<RpcOutput<"banking.refresh">>();
    let imported = false;
    const mock = setupRpc(
      {
        "accounts.list": () => [
          {
            ...account("00000000-0000-4000-8000-000000000081"),
            alias: imported ? "Saldo importado" : "Saldo guardado",
          },
        ],
        "banking.connections": () => [
          { ...bankingConnection, provider: "mock_bank" },
        ],
        "banking.syncStatus": () =>
          bankingSyncStatus({ lastSuccessAt: "2026-11-08T18:00:00.000Z" }),
        "banking.refresh": () => reply.promise,
      },
      "browser",
      true,
      [{ provide: SessionService, useValue: { demoToolsEnabled: () => true } }],
    );
    const fixture = TestBed.createComponent(AccountsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const button = root.querySelector<HTMLButtonElement>(
      "bank-sync-button button",
    );
    if (!button) throw new Error("Missing bank sync action");
    button.click();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Sincronizando");
    await vi.waitFor(() =>
      expect(mock.callsTo("banking.refresh")).toHaveLength(1),
    );
    expect(mock.callsTo("accounts.list")).toHaveLength(1);
    expect(root.textContent).toContain("Saldo guardado");
    imported = true;
    reply.resolve(bankingImportResult);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.callsTo("accounts.list")).toHaveLength(2);
    expect(root.textContent).toContain("Saldo importado");
  });

  it("offers a connection shortcut on an empty account list without loading banking settings", async () => {
    const mock = setupRpc();
    const fixture = TestBed.createComponent(AccountsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector(".empty-state a")?.getAttribute("href")).toBe(
      "/conexiones-bancarias",
    );
    expect(root.textContent).toContain("No hay cuentas activas");
    expect(mock.callsTo("banking.configuration")).toHaveLength(0);
    expect(mock.callsTo("banking.connections")).toHaveLength(0);
  });
});
