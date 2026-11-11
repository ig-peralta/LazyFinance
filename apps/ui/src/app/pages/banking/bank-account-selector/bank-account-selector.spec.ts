import { TransferState } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../../../testing/deferred";
import { eventsIn } from "../../../../testing/dom";
import {
  principal,
  type RpcHandlers,
  type RpcOutput,
  setupRpc,
} from "../../../../testing/rpc";
import { BankAccountSelector } from "./bank-account-selector";

const connectionId = "00000000-0000-4000-8000-000000000101";
const otherId = "00000000-0000-4000-8000-000000000102";
const selection = (
  overrides: Partial<RpcOutput<"banking.accountSelection">> = {},
): RpcOutput<"banking.accountSelection"> => ({
  connectionId,
  version: 3,
  discoveryVersion: 4,
  discoveredAt: "2026-11-10T12:00:00.000Z",
  readRetryAfter: null,
  accounts: [
    {
      externalId: "acc_checking",
      name: "Corriente",
      currency: "CLP",
      numberSuffix: "1234",
      unavailableReason: null,
    },
    {
      externalId: "acc_savings",
      name: "Ahorro",
      currency: "CLP",
      numberSuffix: "5678",
      unavailableReason: null,
    },
  ],
  accountIds: [],
  confirmedAt: null,
  automaticEnrolled: false,
  ...overrides,
});
const button = (root: HTMLElement, text: string) => {
  const value = [...root.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(text),
  );
  if (!value) throw new Error(`Missing button: ${text}`);
  return value;
};
const checkbox = (root: HTMLElement, text: string) => {
  const value = [...root.querySelectorAll("label")]
    .find((item) => item.textContent?.includes(text))
    ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!value) throw new Error(`Missing checkbox: ${text}`);
  return value;
};
const change = (root: HTMLElement, text: string, checked: boolean) => {
  const field = checkbox(root, text);
  field.checked = checked;
  field.dispatchEvent(eventsIn(root)("change"));
};
async function render(handlers: RpcHandlers = {}, initial = selection()) {
  const mock = setupRpc({
    "banking.accountSelection": () => initial,
    ...handlers,
  });
  const fixture = TestBed.createComponent(BankAccountSelector);
  fixture.componentRef.setInput("connectionId", initial.connectionId);
  fixture.componentRef.setInput("enabled", true);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const root: HTMLElement = fixture.nativeElement;
  return { mock, fixture, root };
}

describe("explicit owned account selection", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it("reads saved selection without provider work or browser/transfer persistence; explicit discovery does not import or confirm", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const discovered = selection({ discoveryVersion: 5 });
    const { mock, fixture, root } = await render({
      "banking.discoverAccounts": () => discovered,
    });
    const confirmed: RpcOutput<"banking.selectAccounts">[] = [];
    fixture.componentInstance.confirmed.subscribe((value) =>
      confirmed.push(value),
    );
    expect(mock.calls.map((call) => call.procedure)).toEqual([
      "banking.accountSelection",
    ]);
    button(root, "Consultar cuentas disponibles").click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mock.calls.map((call) => call.procedure)).toEqual([
      "banking.accountSelection",
      "banking.discoverAccounts",
    ]);
    expect(mock.callsTo("banking.discoverAccounts")[0].input).toEqual({
      id: connectionId,
    });
    expect(confirmed).toEqual([]);
    expect(storage).not.toHaveBeenCalled();
    expect(TestBed.inject(TransferState).isEmpty).toBe(true);
    expect(checkbox(root, "Corriente").checked).toBe(false);
  });

  it("discloses a persisted read backoff and does not let discovery bypass it", async () => {
    const { mock, fixture, root } = await render(
      { "banking.discoverAccounts": () => selection() },
      selection({ readRetryAfter: "2099-11-10T12:00:00.000Z" }),
    );
    expect(root.textContent).toContain("período de espera guardado");
    expect(button(root, "Consultar cuentas disponibles").disabled).toBe(true);
    button(root, "Consultar cuentas disponibles").click();
    await fixture.whenStable();
    expect(mock.calls.map((call) => call.procedure)).toEqual([
      "banking.accountSelection",
    ]);
  });

  it("confirms one versioned subset with automatic opt-in only after the response, preventing duplicate saves", async () => {
    const pending = deferred<RpcOutput<"banking.selectAccounts">>();
    const { mock, fixture, root } = await render({
      "banking.selectAccounts": () => pending.promise,
    });
    const confirmed: RpcOutput<"banking.selectAccounts">[] = [],
      activity: boolean[] = [];
    fixture.componentInstance.confirmed.subscribe((value) =>
      confirmed.push(value),
    );
    fixture.componentInstance.pendingChange.subscribe((value) =>
      activity.push(value),
    );
    change(root, "Ahorro", true);
    change(root, "Permitir futuras", true);
    fixture.detectChanges();
    button(root, "Confirmar e importar").click();
    button(root, "Confirmar e importar").click();
    await vi.waitFor(() =>
      expect(mock.callsTo("banking.selectAccounts")).toHaveLength(1),
    );
    fixture.detectChanges();
    expect(confirmed).toEqual([]);
    expect(activity).toContain(true);
    expect(mock.callsTo("banking.selectAccounts")[0].input).toEqual({
      id: connectionId,
      expectedVersion: 3,
      discoveryVersion: 4,
      accountIds: ["acc_savings"],
      automaticEnrolled: true,
    });
    const saved = selection({
      version: 4,
      accountIds: ["acc_savings"],
      automaticEnrolled: true,
      confirmedAt: "2026-11-10T13:00:00.000Z",
    });
    pending.resolve(saved);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(confirmed).toEqual([saved]);
    expect(activity.at(-1)).toBe(false);
    expect(mock.callsTo("banking.importInitial")).toEqual([]);
    expect(mock.callsTo("banking.refresh")).toEqual([]);
    expect(root.textContent).toContain("deshabilitadas en este servidor");
  });

  it("confirms an empty set as a pause, and lets unavailable or missing selected accounts be removed but not added", async () => {
    const initial = selection({
      accountIds: ["acc_savings", "acc_missing"],
      automaticEnrolled: true,
      accounts: [
        ...selection().accounts.slice(0, 1),
        { ...selection().accounts[1], unavailableReason: "removed_from_link" },
        {
          externalId: "acc_usd",
          name: "Dólares",
          currency: "USD",
          numberSuffix: null,
          unavailableReason: "unsupported_currency",
        },
      ],
    });
    const { mock, fixture, root } = await render(
      {
        "banking.selectAccounts": ({ accountIds, automaticEnrolled }) =>
          selection({ version: 4, accountIds, automaticEnrolled }),
      },
      initial,
    );
    expect(checkbox(root, "Dólares").disabled).toBe(true);
    change(root, "Dólares", true); // Synthetic events must not bypass the guard either.
    change(root, "Ahorro", false);
    change(root, "referencia acc_missing", false);
    fixture.detectChanges();
    expect(checkbox(root, "Ahorro").disabled).toBe(true);
    expect(checkbox(root, "referencia acc_missing").disabled).toBe(true);
    change(root, "Ahorro", true);
    button(root, "Confirmar pausa").click();
    await fixture.whenStable();
    expect(mock.callsTo("banking.selectAccounts")[0].input).toEqual({
      id: connectionId,
      expectedVersion: 3,
      discoveryVersion: 4,
      accountIds: [],
      automaticEnrolled: true,
    });
    expect(mock.callsTo("banking.importInitial")).toEqual([]);
  });

  it.each([
    "banking.selectAccounts",
    "banking.discoverAccounts",
  ] as const)("locks uncertain %s until fresh readonly reconciliation without replay", async (procedure) => {
    const fresh = deferred<RpcOutput<"banking.accountSelection">>();
    let reads = 0;
    const { mock, fixture, root } = await render({
      "banking.accountSelection": () =>
        ++reads === 1 ? selection() : fresh.promise,
      "banking.selectAccounts": () => {
        throw new Error("Response lost after possible commit");
      },
      "banking.discoverAccounts": () => {
        throw new Error("Discovery response lost");
      },
    });
    const confirmed: RpcOutput<"banking.selectAccounts">[] = [];
    fixture.componentInstance.confirmed.subscribe((value) =>
      confirmed.push(value),
    );
    change(root, "Corriente", true);
    fixture.detectChanges();
    button(
      root,
      procedure === "banking.selectAccounts"
        ? "Confirmar e importar"
        : "Consultar cuentas disponibles",
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).toContain("No repetimos solicitudes inciertas");
    expect(button(root, "Confirmar e importar").disabled).toBe(true);
    button(root, "Consultar cuentas disponibles").click();
    button(root, "Consultar selección guardada").click();
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(mock.callsTo("banking.accountSelection")).toHaveLength(2),
    );
    expect(
      mock.calls
        .filter((call) => call.procedure !== "banking.accountSelection")
        .map((call) => call.procedure),
    ).toEqual([procedure]);
    fresh.resolve(
      selection({
        version: 8,
        discoveryVersion: 9,
        accountIds: ["acc_savings"],
      }),
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(confirmed).toEqual([]);
    expect(checkbox(root, "Corriente").checked).toBe(false);
    expect(checkbox(root, "Ahorro").checked).toBe(true);
    expect(button(root, "Confirmar e importar").disabled).toBe(false);
    expect(
      mock.calls
        .filter((call) => call.procedure !== "banking.accountSelection")
        .map((call) => call.procedure),
    ).toEqual([procedure]);
  });

  it("discards drafts bound to an old discovery version when a readonly reload returns a new version", async () => {
    let current = selection();
    const { mock, fixture, root } = await render({
      "banking.accountSelection": () => current,
      "banking.selectAccounts": ({ accountIds }) => ({
        ...current,
        accountIds,
      }),
    });
    change(root, "Corriente", true);
    current = selection({
      version: 7,
      discoveryVersion: 11,
      accountIds: ["acc_savings"],
    });
    button(root, "Consultar selección guardada").click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(checkbox(root, "Corriente").checked).toBe(false);
    button(root, "Confirmar e importar").click();
    await fixture.whenStable();
    expect(mock.callsTo("banking.selectAccounts")[0].input).toMatchObject({
      expectedVersion: 7,
      discoveryVersion: 11,
      accountIds: ["acc_savings"],
    });
  });

  it.each([
    "owner",
    "connection",
  ] as const)("aborts an obsolete selection read after a %s change and ignores its late data", async (changeScope) => {
    const old = deferred<RpcOutput<"banking.accountSelection">>();
    let reads = 0;
    const mock = setupRpc({
      "banking.accountSelection": ({ id }) =>
        ++reads === 1
          ? old.promise
          : selection({ connectionId: id, accountIds: ["acc_savings"] }),
    });
    const fixture = TestBed.createComponent(BankAccountSelector);
    fixture.componentRef.setInput("connectionId", connectionId);
    fixture.componentRef.setInput("enabled", true);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(mock.callsTo("banking.accountSelection")).toHaveLength(1),
    );
    if (changeScope === "owner")
      mock.credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    else fixture.componentRef.setInput("connectionId", otherId);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(mock.callsTo("banking.accountSelection")).toHaveLength(2),
    );
    expect(
      mock.callsTo("banking.accountSelection")[0].options?.signal?.aborted,
    ).toBe(true);
    old.resolve(selection({ accountIds: ["acc_checking"] }));
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(checkbox(root, "Corriente").checked).toBe(false);
    expect(checkbox(root, "Ahorro").checked).toBe(true);
    expect(mock.callsTo("banking.selectAccounts")).toHaveLength(0);
  });

  it.each([
    { changeScope: "owner", procedure: "banking.selectAccounts" },
    { changeScope: "connection", procedure: "banking.selectAccounts" },
    { changeScope: "owner", procedure: "banking.discoverAccounts" },
    { changeScope: "connection", procedure: "banking.discoverAccounts" },
  ] as const)("aborts pending $procedure after a $changeScope change and emits no obsolete result", async ({
    changeScope,
    procedure,
  }) => {
    const old = deferred<RpcOutput<"banking.selectAccounts">>();
    const { mock, fixture, root } = await render({
      "banking.accountSelection": ({ id }) => selection({ connectionId: id }),
      "banking.selectAccounts": () => old.promise,
      "banking.discoverAccounts": () => old.promise,
    });
    const confirmed: RpcOutput<"banking.selectAccounts">[] = [];
    fixture.componentInstance.confirmed.subscribe((value) =>
      confirmed.push(value),
    );
    change(root, "Corriente", true);
    fixture.detectChanges();
    button(
      root,
      procedure === "banking.selectAccounts"
        ? "Confirmar e importar"
        : "Consultar cuentas disponibles",
    ).click();
    await vi.waitFor(() => expect(mock.callsTo(procedure)).toHaveLength(1));
    if (changeScope === "owner")
      mock.credentials.accept({ ...principal, userId: "owner-b" }, "bob");
    else fixture.componentRef.setInput("connectionId", otherId);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(mock.callsTo(procedure)[0].options?.signal?.aborted).toBe(true),
    );
    old.resolve(selection({ accountIds: ["acc_checking"], version: 99 }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(confirmed).toEqual([]);
    expect(checkbox(root, "Corriente").checked).toBe(false);
    expect(mock.callsTo(procedure)).toHaveLength(1);
  });
});
