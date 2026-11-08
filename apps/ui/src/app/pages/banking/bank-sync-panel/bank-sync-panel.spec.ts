import { type ComponentFixture, TestBed } from "@angular/core/testing";
import type { BankingSyncStatus } from "@lazyfinance/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bankingConnection,
  bankingImportResult,
  bankingSyncStatus,
} from "../../../../testing/banking";
import { deferred } from "../../../../testing/deferred";
import {
  principal,
  type RpcHandlers,
  type RpcOutput,
  rpcFailure,
  setupRpc,
} from "../../../../testing/rpc";
import { BankSyncPanel } from "./bank-sync-panel";

const account: BankingSyncStatus["accounts"][number] = {
  id: "00000000-0000-4000-8000-000000000081",
  type: "checking",
  freshness: "stale",
  balanceAsOf: "2026-11-01T15:00:00.000Z",
  historyCoverage: {
    completeness: "partial",
    from: "2026-08-11",
    through: "2026-11-08",
  },
};
const imported = (
  changes: Partial<BankingSyncStatus> = {},
): BankingSyncStatus =>
  bankingSyncStatus({
    lastAttemptAt: "2026-11-08T17:00:00.000Z",
    lastSuccessAt: "2026-11-08T17:00:00.000Z",
    lastResult: "complete",
    accounts: [account],
    freshness: {
      state: "stale",
      staleAfterSeconds: 86400,
      freshAccounts: 0,
      staleAccounts: 1,
      unknownAccounts: 0,
    },
    ...changes,
  });

function setup(
  overrides: RpcHandlers = {},
  initial = bankingSyncStatus(),
  authenticated = true,
) {
  let state = initial;
  const mock = setupRpc(
    {
      "banking.syncStatus": () => state,
      "banking.importInitial": () => {
        state = imported();
        return bankingImportResult;
      },
      "banking.refresh": () => {
        state = imported();
        return bankingImportResult;
      },
      ...overrides,
    },
    "browser",
    authenticated,
  );
  const fixture = TestBed.createComponent(BankSyncPanel);
  fixture.componentRef.setInput("connection", bankingConnection);
  fixture.componentRef.setInput("enabled", true);
  const stateRead = vi.fn<(state: BankingSyncStatus) => void>();
  fixture.componentInstance.stateRead.subscribe(stateRead);
  return {
    ...mock,
    fixture,
    stateRead,
    root: fixture.nativeElement as HTMLElement,
    setState(next: BankingSyncStatus) {
      state = next;
    },
  };
}

async function render(fixture: ComponentFixture<BankSyncPanel>) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function button(root: HTMLElement, text: string) {
  const value = [...root.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === text,
  );
  if (!value) throw new Error(`Missing button: ${text}`);
  return value;
}

describe("explicit owned snapshot import, refresh and read reconciliation", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it("does not query before authentication, then reads only the selected connection without importing", async () => {
    const f = setup({}, bankingSyncStatus(), false);
    await render(f.fixture);
    expect(f.calls).toHaveLength(0);
    f.credentials.accept(principal, "verified");
    await render(f.fixture);
    expect(f.callsTo("banking.syncStatus")).toHaveLength(1);
    expect(f.callsTo("banking.syncStatus")[0]).toMatchObject({
      input: { id: bankingConnection.id },
      authorization: "Bearer verified",
    });
    expect(f.root.textContent).toContain("Sin importación confirmada");
    expect(f.root.textContent).toContain("No obliga al banco");
    expect(f.callsTo("banking.importInitial")).toHaveLength(0);
    expect(f.callsTo("banking.refresh")).toHaveLength(0);
    expect(f.callsTo("accounts.list")).toHaveLength(0);
  });

  it("waits for initial-import confirmation, suppresses duplicates and uses refresh only after a confirmed import", async () => {
    const pending = deferred<RpcOutput<"banking.importInitial">>();
    const f = setup({ "banking.importInitial": () => pending.promise });
    await render(f.fixture);
    const start = button(f.root, "Importar datos disponibles");
    start.click();
    start.click();
    await vi.waitFor(() =>
      expect(f.callsTo("banking.importInitial")).toHaveLength(1),
    );
    f.fixture.detectChanges();
    expect(f.root.textContent).toContain("Esperando confirmación");
    expect(f.root.textContent).not.toContain("Importación completada.");
    expect(button(f.root, "Sincronizando…").disabled).toBe(true);
    f.setState(imported());
    pending.resolve(bankingImportResult);
    await render(f.fixture);
    expect(f.root.textContent).toContain("Importación completada.");
    expect(f.root.textContent).toContain(
      "registros revisados, no filas nuevas",
    );
    expect(f.root.textContent).toContain("2026-11-08 a 2026-11-08");
    expect(f.root.textContent).toContain(
      "cobertura importada sigue siendo parcial",
    );
    expect(f.root.textContent).toContain("saldos de tarjeta desconocidos");
    expect(f.root.textContent).toContain("cuentas omitidas");
    expect(f.root.textContent).toContain(
      "Saldo con antigüedad de 24 horas o más",
    );
    expect(f.root.textContent).not.toContain("Saldo reciente a la consulta");
    expect(f.root.textContent).not.toContain("acc_card_fixture");
    button(f.root, "Actualizar datos disponibles").click();
    await render(f.fixture);
    expect(f.callsTo("banking.refresh")).toHaveLength(1);
    expect(f.callsTo("banking.refresh")[0].input).toEqual({
      id: bankingConnection.id,
    });
    expect(f.callsTo("banking.importInitial")).toHaveLength(1);
    expect(
      f.root.querySelector(`a[href*="account=${account.id}"]`),
    ).not.toBeNull();
    expect(f.callsTo("summaries.monthly")).toHaveLength(0);
  });

  it.each([
    "retryable",
    "invalid_data",
  ] as const)("shows a confirmed %s failure without relabeling last-good data or keeping a success report", async (reason) => {
    const f = setup(
      {
        "banking.refresh": () => {
          f.setState(
            imported({
              failure: {
                at: "2026-11-08T18:00:00.000Z",
                reason,
                retryAfter: null,
              },
            }),
          );
          return { status: "failed", reason, retryAfter: null };
        },
      },
      imported(),
    );
    await render(f.fixture);
    button(f.root, "Actualizar datos disponibles").click();
    await render(f.fixture);
    expect(f.root.textContent).toContain("No se completó la sincronización");
    expect(f.root.textContent).toContain("Último intento fallido");
    expect(f.root.textContent).toContain(
      "última importación correcta se conservan",
    );
    expect(f.root.textContent).toContain("Saldo con antigüedad");
    expect(f.root.textContent).not.toContain("Importación completada.");
    expect(f.root.textContent).not.toContain("Registros examinados");
    expect(f.stateRead).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastSuccessAt: imported().lastSuccessAt }),
    );
    f.handlers["banking.refresh"] = () => {
      f.setState(imported());
      return bankingImportResult;
    };
    button(f.root, "Actualizar datos disponibles").click();
    await render(f.fixture);
    expect(f.root.textContent).toContain("Importación completada.");
    expect(f.root.textContent).not.toContain("Último intento fallido");
  });

  it("uses readonly status to follow another in-progress attempt and never polls or retries it automatically", async () => {
    const f = setup(
      {
        "banking.refresh": () => {
          f.setState(
            imported({
              activity: "in_progress",
              leaseExpiresAt: "2026-11-08T18:05:00.000Z",
              canRefresh: false,
            }),
          );
          return { status: "in_progress", until: "2026-11-08T18:05:00.000Z" };
        },
      },
      imported(),
    );
    await render(f.fixture);
    button(f.root, "Actualizar datos disponibles").click();
    await render(f.fixture);
    expect(f.root.textContent).toContain("No se inició otro intento");
    expect(f.root.textContent).toContain("Sincronización en curso");
    expect(button(f.root, "Actualizar datos disponibles").disabled).toBe(true);
    expect(f.callsTo("banking.syncStatus")).toHaveLength(2);
    f.setState(imported());
    button(f.root, "Consultar estado").click();
    await render(f.fixture);
    expect(f.callsTo("banking.refresh")).toHaveLength(1);
    expect(f.callsTo("banking.syncStatus")).toHaveLength(3);
    expect(button(f.root, "Actualizar datos disponibles").disabled).toBe(false);
  });

  it("honors stored backoff until a new readonly status permits another explicit attempt", async () => {
    const f = setup(
      {
        "banking.refresh": () => {
          f.setState(
            imported({
              canRefresh: false,
              failure: {
                at: "2026-11-08T17:59:00.000Z",
                reason: "retryable",
                retryAfter: "2026-11-08T18:05:00.000Z",
              },
            }),
          );
          return {
            status: "retry_later",
            retryAfter: "2026-11-08T18:05:00.000Z",
          };
        },
      },
      imported(),
    );
    await render(f.fixture);
    button(f.root, "Actualizar datos disponibles").click();
    await render(f.fixture);
    expect(f.root.textContent).toContain("Fintoc solicitó esperar");
    expect(button(f.root, "Actualizar datos disponibles").disabled).toBe(true);
    f.setState(imported());
    button(f.root, "Consultar estado").click();
    await render(f.fixture);
    expect(button(f.root, "Actualizar datos disponibles").disabled).toBe(false);
    expect(f.callsTo("banking.refresh")).toHaveLength(1);
  });

  it.each([
    "expired",
    "revoked",
  ] as const)("disables synchronization for %s access while preserving source history/freshness", async (lifecycle) => {
    const f = setup({}, imported({ lifecycle, canRefresh: false }));
    await render(f.fixture);
    expect(button(f.root, "Actualizar datos disponibles").disabled).toBe(true);
    expect(f.root.textContent).toContain("Revincular");
    expect(f.root.textContent).toContain("Última importación correcta");
    expect(f.root.textContent).toContain("Saldo con antigüedad");
    expect(f.callsTo("banking.refresh")).toHaveLength(0);
  });

  it("distinguishes an interrupted attempt, review conflicts and unknown card sources without financial calculations", async () => {
    const f = setup(
      {},
      imported({
        activity: "interrupted",
        leaseExpiresAt: "2026-11-08T17:05:00.000Z",
        accounts: [
          {
            ...account,
            type: "credit_card",
            freshness: "unknown",
            balanceAsOf: null,
          },
        ],
        freshness: {
          state: "unknown",
          staleAfterSeconds: 86400,
          freshAccounts: 0,
          staleAccounts: 0,
          unknownAccounts: 1,
        },
      }),
    );
    await render(f.fixture);
    expect(f.root.textContent).toContain("Intento interrumpido");
    expect(f.root.textContent).toContain("Antigüedad del saldo desconocida");
    expect(button(f.root, "Actualizar datos disponibles").disabled).toBe(false);
    f.handlers["banking.refresh"] = () => {
      f.setState(
        imported({
          lastResult: "needs_review",
          unresolvedConflictCount: 2,
          providerSuspensionCount: 1,
        }),
      );
      return {
        ...bankingImportResult,
        status: "needs_review",
        conflictCount: 2,
      };
    };
    button(f.root, "Actualizar datos disponibles").click();
    await render(f.fixture);
    expect(f.root.textContent).toContain("2 conflictos pendientes");
    expect(f.root.textContent).toContain(
      "1 corresponden a movimientos antes contabilizados",
    );
    expect(f.root.textContent).toContain(
      "Se conservan etiquetas, decisiones, ingresos vinculados y devoluciones",
    );
  });

  it("requires an explicit fresh status read after an ambiguous mutation and never automatically replays it", async () => {
    const f = setup({ "banking.refresh": () => rpcFailure() }, imported());
    await render(f.fixture);
    button(f.root, "Actualizar datos disponibles").click();
    await render(f.fixture);
    expect(f.root.textContent).toContain("Resultado no confirmado");
    expect(button(f.root, "Actualizar datos disponibles").disabled).toBe(true);
    expect(f.callsTo("banking.syncStatus")).toHaveLength(1);
    button(f.root, "Actualizar datos disponibles").click();
    expect(f.callsTo("banking.refresh")).toHaveLength(1);
    f.handlers["banking.syncStatus"] = () => rpcFailure();
    button(f.root, "Consultar estado").click();
    await render(f.fixture);
    expect(button(f.root, "Sincronizar datos").disabled).toBe(true);
    expect(f.root.textContent).toContain(
      "No pudimos consultar la sincronización",
    );
    f.handlers["banking.syncStatus"] = () => imported();
    button(f.root, "Consultar estado").click();
    await render(f.fixture);
    expect(button(f.root, "Actualizar datos disponibles").disabled).toBe(false);
    expect(f.callsTo("banking.refresh")).toHaveLength(1);
  });

  it("keeps known configuration unavailability separate from readonly status", async () => {
    const f = setup({}, imported());
    f.fixture.componentRef.setInput("enabled", false);
    await render(f.fixture);
    expect(f.root.textContent).toContain("Última importación completada");
    expect(button(f.root, "Actualizar datos disponibles").disabled).toBe(true);
    expect(button(f.root, "Consultar estado").disabled).toBe(false);
    expect(f.callsTo("banking.refresh")).toHaveLength(0);
  });

  it("explains the original link-day boundary in Santiago, same-day precision and retained older records", async () => {
    const f = setup();
    f.fixture.componentRef.setInput("connection", {
      ...bankingConnection,
      createdAt: "2026-11-09T01:00:00.000Z",
    });
    await render(f.fixture);
    expect(f.root.textContent).toContain("Seguimiento desde el 2026-11-08");
    expect(f.root.textContent).toContain(
      "sin buscar transacciones de días anteriores",
    );
    expect(f.root.textContent).toContain(
      "Actualizar o revincular no cambia esta fecha",
    );
    expect(f.root.textContent).toContain("dentro del mismo día");
    expect(f.root.textContent).toContain(
      "Los registros ya importados se conservan",
    );
    f.fixture.componentRef.setInput("connection", {
      ...bankingConnection,
      createdAt: "2026-11-09T01:00:00.000Z",
      updatedAt: "2026-11-12T18:00:00.000Z",
    });
    await render(f.fixture);
    expect(f.root.textContent).toContain("Seguimiento desde el 2026-11-08");
    expect(f.callsTo("banking.importInitial")).toHaveLength(0);
  });

  it("does not use a status read completed before an uncertain mutation response to unlock another attempt", async () => {
    const pending = deferred<Response>();
    const f = setup({ "banking.refresh": () => pending.promise }, imported());
    await render(f.fixture);
    button(f.root, "Actualizar datos disponibles").click();
    await vi.waitFor(() =>
      expect(f.callsTo("banking.refresh")).toHaveLength(1),
    );
    button(f.root, "Consultar estado").click();
    await vi.waitFor(() =>
      expect(f.callsTo("banking.syncStatus")).toHaveLength(2),
    );
    pending.resolve(rpcFailure());
    await render(f.fixture);
    expect(button(f.root, "Actualizar datos disponibles").disabled).toBe(true);
    button(f.root, "Consultar estado").click();
    await render(f.fixture);
    expect(button(f.root, "Actualizar datos disponibles").disabled).toBe(false);
    expect(f.callsTo("banking.refresh")).toHaveLength(1);
  });

  it("rejects a mismatched status response and does not enable a blind import", async () => {
    const f = setup({
      "banking.syncStatus": () =>
        bankingSyncStatus({
          connectionId: "00000000-0000-4000-8000-000000000099",
        }),
    });
    await render(f.fixture);
    expect(f.root.textContent).toContain(
      "No pudimos consultar la sincronización",
    );
    expect(button(f.root, "Sincronizar datos").disabled).toBe(true);
    expect(f.stateRead).not.toHaveBeenCalled();
  });

  it("cancels old status reads and ignores late results after replacing credentials for the same user", async () => {
    const old = deferred<RpcOutput<"banking.syncStatus">>();
    const f = setup({
      "banking.syncStatus": (_input, call) =>
        call.authorization === "Bearer alice"
          ? old.promise
          : bankingSyncStatus(),
    });
    f.fixture.detectChanges();
    await vi.waitFor(() =>
      expect(f.callsTo("banking.syncStatus")).toHaveLength(1),
    );
    f.credentials.accept(principal, "refreshed");
    await render(f.fixture);
    old.resolve(imported());
    await render(f.fixture);
    expect(f.root.textContent).not.toContain("Saldo con antigüedad");
    expect(f.root.textContent).toContain("Sin importación confirmada");
    expect(f.callsTo("banking.syncStatus")[0].options?.signal?.aborted).toBe(
      true,
    );
    expect(f.stateRead).not.toHaveBeenCalledWith(
      expect.objectContaining({ accounts: [account] }),
    );
  });

  it("does not let a pre-completion status read replace the confirmed refresh result", async () => {
    const mutation = deferred<RpcOutput<"banking.refresh">>(),
      oldRead = deferred<RpcOutput<"banking.syncStatus">>();
    let reads = 0;
    const f = setup(
      {
        "banking.refresh": () => mutation.promise,
        "banking.syncStatus": () =>
          ++reads === 2 ? oldRead.promise : imported(),
      },
      imported(),
    );
    await render(f.fixture);
    button(f.root, "Actualizar datos disponibles").click();
    await vi.waitFor(() =>
      expect(f.callsTo("banking.refresh")).toHaveLength(1),
    );
    button(f.root, "Consultar estado").click();
    await vi.waitFor(() =>
      expect(f.callsTo("banking.syncStatus")).toHaveLength(2),
    );
    mutation.resolve(bankingImportResult);
    await render(f.fixture);
    expect(f.callsTo("banking.syncStatus")[1].options?.signal?.aborted).toBe(
      true,
    );
    oldRead.resolve(imported({ activity: "in_progress", canRefresh: false }));
    await render(f.fixture);
    expect(f.root.textContent).toContain("Última importación completada");
    expect(f.root.textContent).not.toContain("Sincronización en curso");
    expect(button(f.root, "Actualizar datos disponibles").disabled).toBe(false);
  });

  it("cancels a pending mutation on logout and ignores its late success for another owner", async () => {
    const old = deferred<RpcOutput<"banking.refresh">>();
    const f = setup({ "banking.refresh": () => old.promise }, imported());
    await render(f.fixture);
    button(f.root, "Actualizar datos disponibles").click();
    await vi.waitFor(() =>
      expect(f.callsTo("banking.refresh")).toHaveLength(1),
    );
    f.credentials.clear();
    f.fixture.detectChanges();
    expect(f.callsTo("banking.refresh")[0].options?.signal?.aborted).toBe(true);
    f.handlers["banking.syncStatus"] = () => bankingSyncStatus();
    f.credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    old.resolve(bankingImportResult);
    await render(f.fixture);
    expect(f.root.textContent).not.toContain("Importación completada.");
    expect(f.root.textContent).not.toContain("Registros examinados");
    expect(f.callsTo("banking.syncStatus")).toHaveLength(2);
  });

  it("aborts pending reads and writes on destruction without interpreting that as server rollback", async () => {
    const old = deferred<RpcOutput<"banking.refresh">>();
    const f = setup({ "banking.refresh": () => old.promise }, imported());
    await render(f.fixture);
    button(f.root, "Actualizar datos disponibles").click();
    await vi.waitFor(() =>
      expect(f.callsTo("banking.refresh")).toHaveLength(1),
    );
    f.fixture.destroy();
    expect(f.callsTo("banking.refresh")[0].options?.signal?.aborted).toBe(true);
    old.resolve(bankingImportResult);
    await Promise.resolve();
    expect(f.callsTo("banking.refresh")).toHaveLength(1);
    expect(f.callsTo("banking.syncStatus")).toHaveLength(1);
  });
});
