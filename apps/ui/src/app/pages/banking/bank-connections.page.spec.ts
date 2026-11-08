import { type ComponentFixture, TestBed } from "@angular/core/testing";
import type { BankingConnection } from "@lazyfinance/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bankingConfiguration,
  bankingConnection,
  bankingIntent,
} from "../../../testing/banking";
import { deferred } from "../../../testing/deferred";
import {
  principal,
  type RpcHandlers,
  type RpcOutput,
  rpcFailure,
  setupRpc,
} from "../../../testing/rpc";
import { FintocWidget } from "../../features/banking/fintoc-widget";
import { BankConnectionsPage } from "./bank-connections.page";

function setup(overrides: RpcHandlers = {}, initial: BankingConnection[] = []) {
  let banks = initial;
  const mock = setupRpc({
    "banking.configuration": () => bankingConfiguration,
    "banking.connections": () => banks,
    "banking.createLinkIntent": () => bankingIntent,
    "banking.completeLink": () => {
      banks = [bankingConnection];
      return bankingConnection;
    },
    "banking.checkConnection": () => bankingConnection,
    "banking.disconnect": () => {
      const value: BankingConnection = {
        ...bankingConnection,
        status: "revoked",
        disconnectedAt: "2026-11-08T18:00:00.000Z",
        disconnectPending: false,
      };
      banks = [value];
      return value;
    },
    ...overrides,
  });
  const widget = {
    authorize: vi
      .spyOn(TestBed.inject(FintocWidget), "authorize")
      .mockResolvedValue(null),
  } satisfies Pick<FintocWidget, "authorize">;
  const fixture = TestBed.createComponent(BankConnectionsPage);
  return {
    ...mock,
    widget,
    fixture,
    root: fixture.nativeElement as HTMLElement,
    setBanks(value: BankingConnection[]) {
      banks = value;
    },
  };
}

async function render(fixture: ComponentFixture<BankConnectionsPage>) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function button(root: HTMLElement, label: string) {
  const found = [...root.querySelectorAll("button")].find(
    (node) => node.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

async function begin(f: ReturnType<typeof setup>) {
  await render(f.fixture);
  button(f.root, "Conectar banco").click();
  f.fixture.detectChanges();
  button(f.root, "Abrir Fintoc").click();
}

describe("owned banking controls without fabricated financial refresh", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it("keeps the Widget lazy, binds the callback to its intent and waits for backend confirmation", async () => {
    const authorization = deferred<string | null>(),
      completion = deferred<RpcOutput<"banking.completeLink">>();
    const f = setup({ "banking.completeLink": () => completion.promise });
    f.widget.authorize.mockReturnValueOnce(authorization.promise);
    await render(f.fixture);
    expect(f.widget.authorize).not.toHaveBeenCalled();
    expect(f.root.querySelector("h1")?.textContent).toContain(
      "Conexiones bancarias",
    );
    expect(f.root.querySelector('a[href="/cuentas"]')).not.toBeNull();
    expect(f.callsTo("banking.createLinkIntent")).toHaveLength(0);
    button(f.root, "Conectar banco").click();
    f.fixture.detectChanges();
    expect(f.root.textContent).toContain("No ingreses");
    const open = button(f.root, "Abrir Fintoc");
    open.click();
    open.click();
    await vi.waitFor(() => expect(f.widget.authorize).toHaveBeenCalledOnce());
    f.fixture.detectChanges();
    expect(f.callsTo("banking.createLinkIntent")).toHaveLength(1);
    expect(f.callsTo("banking.completeLink")).toHaveLength(0);
    expect(f.widget.authorize.mock.calls[0][0]).toEqual({
      publicKey: bankingIntent.publicKey,
      widgetToken: bankingIntent.widgetToken,
    });
    authorization.resolve("li_ui_exc_callback");
    await vi.waitFor(() =>
      expect(f.callsTo("banking.completeLink")).toHaveLength(1),
    );
    f.fixture.detectChanges();
    expect(f.root.textContent).toContain("Confirmando la conexión");
    expect(f.root.textContent).not.toContain(
      "Autorización de Bci de prueba guardada",
    );
    expect(f.callsTo("banking.completeLink")[0].input).toEqual({
      id: bankingIntent.id,
      exchangeToken: "li_ui_exc_callback",
    });
    f.setBanks([bankingConnection]);
    completion.resolve(bankingConnection);
    await render(f.fixture);
    expect(f.root.textContent).toContain(
      "Autorización de Bci de prueba guardada",
    );
    expect(f.root.textContent).toContain("Acceso disponible");
    expect(button(f.root, "Actualizar desde el banco").disabled).toBe(true);
    expect(f.callsTo("accounts.list")).toHaveLength(0);
    expect(f.root.textContent).not.toContain(bankingIntent.widgetToken);
    expect(f.root.textContent).not.toContain("li_ui_exc_callback");
  });

  it("sends the chosen holder type and treats provider exit as cancellation, not a linked bank", async () => {
    const f = setup();
    await render(f.fixture);
    button(f.root, "Conectar banco").click();
    f.fixture.detectChanges();
    const select = f.root.querySelector("select");
    if (!select) throw new Error("Expected holder selection");
    select.value = "business";
    select.dispatchEvent(new Event("change"));
    button(f.root, "Abrir Fintoc").click();
    await render(f.fixture);
    expect(f.callsTo("banking.createLinkIntent")[0].input).toEqual({
      holderType: "business",
    });
    expect(f.callsTo("banking.completeLink")).toHaveLength(0);
    expect(f.root.textContent).not.toContain("Autorización de");
    expect(button(f.root, "Conectar banco").disabled).toBe(false);
  });

  it("does not open a live Widget after the user saw a sandbox configuration", async () => {
    const f = setup({
      "banking.createLinkIntent": () => ({
        ...bankingIntent,
        mode: "live",
        publicKey: "pk_live_fixture",
      }),
    });
    await begin(f);
    await render(f.fixture);
    expect(f.widget.authorize).not.toHaveBeenCalled();
    expect(f.root.textContent).toContain("No pudimos confirmar esta conexión");
    expect(button(f.root, "Abrir Fintoc").disabled).toBe(true);
    button(f.root, "Consultar conexiones guardadas").click();
    await render(f.fixture);
    expect(f.callsTo("banking.createLinkIntent")).toHaveLength(1);
    expect(f.callsTo("banking.completeLink")).toHaveLength(0);
  });

  it("sanitizes Widget failures and never automatically replays an uncertain completion", async () => {
    const f = setup({ "banking.completeLink": () => rpcFailure() });
    f.widget.authorize.mockResolvedValueOnce("li_ui_exc_once");
    await begin(f);
    await render(f.fixture);
    expect(f.root.textContent).toContain(
      "no repetimos el intercambio automáticamente",
    );
    expect(f.callsTo("banking.completeLink")).toHaveLength(1);
    button(f.root, "Consultar conexiones guardadas").click();
    await render(f.fixture);
    expect(f.callsTo("banking.completeLink")).toHaveLength(1);

    f.widget.authorize.mockRejectedValueOnce(
      new Error("URL contains sensitive-exchange-token"),
    );
    await begin(f);
    await render(f.fixture);
    expect(f.root.textContent).toContain("No pudimos confirmar esta conexión");
    expect(f.root.textContent).not.toContain("sensitive-exchange-token");
  });

  it("keeps unavailable configuration and failed connection reads distinct from an empty list", async () => {
    const f = setup({
      "banking.configuration": () => ({ enabled: false }),
      "banking.connections": () => rpcFailure(),
    });
    await render(f.fixture);
    expect(f.root.textContent).toContain("Fintoc no está habilitado");
    expect(f.root.textContent).toContain("No asumimos que no tengas bancos");
    expect(f.root.textContent).not.toContain("Aún no hay conexiones guardadas");
    expect(f.widget.authorize).not.toHaveBeenCalled();
  });

  it("checks access separately and reconnects the same local connection", async () => {
    const f = setup({}, [bankingConnection]);
    f.handlers["banking.checkConnection"] = () => {
      const bank: BankingConnection = {
        ...bankingConnection,
        status: "expired",
      };
      f.setBanks([bank]);
      return bank;
    };
    await render(f.fixture);
    button(f.root, "Comprobar acceso").click();
    await render(f.fixture);
    expect(f.root.textContent).toContain("Requiere reconexión");
    expect(f.root.textContent).toContain(
      "No se actualizaron saldos ni movimientos",
    );
    expect(f.callsTo("accounts.list")).toHaveLength(0);
    button(f.root, "Revincular").click();
    f.fixture.detectChanges();
    expect(f.root.textContent).toContain("usa el mismo usuario");
    expect(f.root.querySelector("select")).toBeNull();
    f.widget.authorize.mockResolvedValueOnce("li_ui_exc_relink");
    button(f.root, "Abrir Fintoc").click();
    await render(f.fixture);
    expect(f.callsTo("banking.createLinkIntent")[0].input).toEqual({
      holderType: "individual",
      connectionId: bankingConnection.id,
    });
    expect(f.root.textContent).toContain("Acceso disponible");
  });

  it("requires disconnect confirmation, shows partial cleanup and reconciles only after an explicit repeat", async () => {
    const f = setup({}, [bankingConnection]);
    f.handlers["banking.disconnect"] = () => {
      f.setBanks([
        {
          ...bankingConnection,
          status: "revoked",
          disconnectedAt: "2026-11-08T18:00:00.000Z",
          disconnectPending: true,
        },
      ]);
      return rpcFailure();
    };
    await render(f.fixture);
    button(f.root, "Desconectar").click();
    f.fixture.detectChanges();
    expect(f.callsTo("banking.disconnect")).toHaveLength(0);
    expect(f.root.textContent).toContain("No cerramos tu cuenta bancaria");
    button(f.root, "Sí, desconectar").click();
    await render(f.fixture);
    expect(f.root.textContent).toContain("Desconexión pendiente");
    expect(f.callsTo("banking.disconnect")).toHaveLength(1);
    f.handlers["banking.disconnect"] = () => {
      const bank: BankingConnection = {
        ...bankingConnection,
        status: "revoked",
        disconnectedAt: "2026-11-08T18:00:00.000Z",
        disconnectPending: false,
      };
      f.setBanks([bank]);
      return bank;
    };
    button(f.root, "Completar desconexión").click();
    f.fixture.detectChanges();
    button(f.root, "Sí, desconectar").click();
    await render(f.fixture);
    expect(f.callsTo("banking.disconnect")).toHaveLength(2);
    expect(f.root.textContent).toContain("Desconectada");
    expect(f.root.textContent).toContain(
      "historial financiero guardado se conserva",
    );
    expect(
      [...f.root.querySelectorAll("button")].some(
        (node) => node.textContent?.trim() === "Revincular",
      ),
    ).toBe(false);
  });

  it.each([
    { enabled: false },
    { ...bankingConfiguration, mode: "live", publicKey: "pk_live_ui_fixture" },
  ] satisfies RpcOutput<"banking.configuration">[])("still permits a local disconnect with unavailable/mismatched configuration %j", async (configuration) => {
    const f = setup({ "banking.configuration": () => configuration }, [
      bankingConnection,
    ]);
    await render(f.fixture);
    expect(button(f.root, "Comprobar acceso").disabled).toBe(true);
    expect(button(f.root, "Revincular").disabled).toBe(true);
    expect(button(f.root, "Desconectar").disabled).toBe(false);
    button(f.root, "Desconectar").click();
    f.fixture.detectChanges();
    button(f.root, "Cancelar").click();
    f.fixture.detectChanges();
    expect(f.callsTo("banking.disconnect")).toHaveLength(0);
  });

  it("cancels an open authorization on logout and ignores the obsolete callback after a user change", async () => {
    const authorization = deferred<string | null>();
    const f = setup({
      "banking.connections": (_input, call) =>
        call.authorization === "Bearer bob" ? [] : [bankingConnection],
    });
    f.widget.authorize.mockReturnValueOnce(authorization.promise);
    await begin(f);
    await vi.waitFor(() => expect(f.widget.authorize).toHaveBeenCalledOnce());
    const signal = f.widget.authorize.mock.calls[0][1];
    f.credentials.clear();
    f.fixture.detectChanges();
    expect(signal.aborted).toBe(true);
    f.credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    authorization.resolve("li_old_exc_obsolete");
    await render(f.fixture);
    expect(f.callsTo("banking.completeLink")).toHaveLength(0);
    expect(f.root.textContent).not.toContain("Bci de prueba");
    expect(f.root.textContent).not.toContain("Autorización de");
  });

  it("does not show a late completion or confirmation target to a different user", async () => {
    const completion = deferred<RpcOutput<"banking.completeLink">>();
    const f = setup({ "banking.completeLink": () => completion.promise });
    f.widget.authorize.mockResolvedValueOnce("li_ui_exc_old");
    await begin(f);
    await vi.waitFor(() =>
      expect(f.callsTo("banking.completeLink")).toHaveLength(1),
    );
    f.credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    completion.resolve(bankingConnection);
    await render(f.fixture);
    expect(f.root.textContent).not.toContain("Autorización de");
    expect(f.root.textContent).not.toContain("Bci de prueba");
    expect(f.callsTo("banking.completeLink")).toHaveLength(1);
  });

  it("never opens the Widget if navigation destroys a pending intent request", async () => {
    const intent = deferred<RpcOutput<"banking.createLinkIntent">>();
    const f = setup({ "banking.createLinkIntent": () => intent.promise });
    await begin(f);
    await vi.waitFor(() =>
      expect(f.callsTo("banking.createLinkIntent")).toHaveLength(1),
    );
    f.fixture.destroy();
    intent.resolve(bankingIntent);
    await Promise.resolve();
    await Promise.resolve();
    expect(f.widget.authorize).not.toHaveBeenCalled();
    expect(
      f.callsTo("banking.createLinkIntent")[0].options?.signal?.aborted,
    ).toBe(true);
  });
});
