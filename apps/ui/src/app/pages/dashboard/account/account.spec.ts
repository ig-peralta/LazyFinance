import { TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rpcFailure, setupRpc } from "../../../../testing/rpc";
import { Account } from "./account";

describe("Account resource view", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("distinguishes cash, credit card debt and unknown balances", async () => {
    setupRpc({
      "accounts.list": () => [
        {
          id: "checking",
          alias: "Cuenta corriente",
          type: "checking",
          currency: "CLP",
          balance: "125000.00",
          lastSyncedAt: null,
        },
        {
          id: "card",
          alias: "Tarjeta",
          type: "credit_card",
          currency: "CLP",
          balance: "-49990.00",
          lastSyncedAt: "2026-10-15T15:00:00.000Z",
        },
        {
          id: "unknown",
          alias: "Nueva cuenta",
          type: "checking",
          currency: "CLP",
          balance: null,
          lastSyncedAt: null,
        },
      ],
    });
    const fixture = TestBed.createComponent(Account);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    for (const value of [
      "Cuenta corriente",
      "$125.000",
      "Saldo adeudado",
      "$49.990",
      "Actualizado",
      "Sin información de actualización",
      "Saldo no disponible",
      "Sin saldo confirmado",
    ]) {
      expect(text).toContain(value);
    }
  });

  it("renders on the server without serializing accounts into TransferState", async () => {
    setupRpc({}, "server");
    const fixture = TestBed.createComponent(Account);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "Todavía no hay cuentas",
    );
    expect(TestBed.inject(TransferState).toJson()).toBe("{}");
  });

  it("offers a resource reload after unavailability", async () => {
    const handler = vi
      .fn()
      .mockReturnValueOnce(rpcFailure())
      .mockReturnValueOnce([]);
    setupRpc({ "accounts.list": handler });
    const fixture = TestBed.createComponent(Account);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "No pudimos cargar tus cuentas",
    );
    fixture.nativeElement
      .querySelector('[data-testid="retry-accounts"]')
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "Todavía no hay cuentas",
    );
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("lets centralized session handling expire an unauthorized request", async () => {
    const { credentials, navigate } = setupRpc({
      "accounts.list": () => rpcFailure("UNAUTHORIZED", 401),
    });
    const fixture = TestBed.createComponent(Account);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(credentials.current()).toBeUndefined();
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/login");
  });
});
