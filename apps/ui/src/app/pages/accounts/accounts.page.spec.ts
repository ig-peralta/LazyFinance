import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { account, principal, rpcFailure, setupRpc } from "../../../testing/rpc";
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
    expect(root.textContent).toContain("Saldo no disponible");
    expect(root.textContent).toContain("Saldo adeudado");
    expect(root.textContent).toContain("$9.007.199.254.740,99");
    expect(root.textContent).toContain("Registro anterior a 24 horas");
    expect(
      [...root.querySelectorAll("button")].filter((button) => button.disabled),
    ).toHaveLength(4);
    expect(root.textContent).toContain("no informado por esta API");
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
    setupRpc({ "accounts.list": () => rpcFailure() });
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
  });
});
