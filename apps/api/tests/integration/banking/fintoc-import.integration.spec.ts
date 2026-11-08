import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { FintocLink } from "../../../src/banking/fintoc/client/fintoc-client";
import type {
  FintocAccount,
  FintocMovement,
} from "../../../src/banking/fintoc/client/fintoc-snapshot.schema";
import { BankingIngestionService } from "../../../src/banking/ingestion/banking-ingestion.service";
import {
  fintocEnvironment,
  fintocIntent,
  fintocLink,
} from "../../fixtures/banking/fintoc";
import {
  fintocAccount,
  fintocMovement,
} from "../../fixtures/banking/fintoc-snapshot";
import { fixture, integration, startApi } from "../../fixtures/persistence";

async function setup() {
  const f = await fixture();
  f.environment = fintocEnvironment();
  const externalId = `link_${randomUUID().replaceAll("-", "")}`;
  const link: FintocLink = {
    ...fintocLink,
    id: externalId,
    link_token: `${externalId}_token_fixture`,
  };
  const accounts: FintocAccount[] = [
    fintocAccount,
    {
      ...fintocAccount,
      id: "acc_savings",
      type: "savings_account",
      balance: { current: 150_000 },
    },
    { ...fintocAccount, id: "acc_card", type: "credit_card" },
    { ...fintocAccount, id: "acc_usd", currency: "USD" },
    { ...fintocAccount, id: "acc_line", type: "line_of_credit" },
  ];
  const movements: Record<string, FintocMovement[]> = {
    acc_checking: [
      fintocMovement,
      {
        ...fintocMovement,
        id: "mov_salary",
        amount: 750_000,
        description: "SUELDO",
        type: "transfer",
      },
      {
        ...fintocMovement,
        id: "mov_own_transfer",
        amount: -20_000,
        type: "transfer",
        recipient_account: { holder_id: "12345678-5" },
      },
      {
        ...fintocMovement,
        id: "mov_card_payment",
        amount: -10_000,
        description: "PAGO TARJETA",
      },
      { ...fintocMovement, id: "mov_pending", pending: true, type: "check" },
      { ...fintocMovement, id: "mov_processing", status: "processing" },
      { ...fintocMovement, id: "mov_reversed", status: "reversed" },
    ],
    acc_savings: [
      {
        ...fintocMovement,
        id: "mov_transfer_in",
        amount: 20_000,
        type: "transfer",
        sender_account: { holder_id: "12345678-5" },
      },
    ],
    acc_card: [
      { ...fintocMovement, id: "mov_charge", amount: -2000 },
      { ...fintocMovement, id: "mov_payment", amount: 10_000 },
    ],
  };
  const state = {
    link,
    accounts,
    movements,
    failMovements: false,
    invalidMovement: false,
  };
  const onRead = vi.fn<(url: URL) => Promise<void>>(async () => {});
  const fetch = vi.fn<typeof globalThis.fetch>(async (address, options) => {
    const url = new URL(String(address));
    expect(url.origin).toBe("https://api.fintoc.com");
    expect(new Headers(options?.headers).get("Fintoc-Version")).toBe(
      "2026-02-01",
    );
    if (url.pathname === "/v1/link_intents") {
      const id = `li_${randomUUID().replaceAll("-", "")}`;
      return Response.json({
        ...fintocIntent,
        id,
        widget_token: `${id}_sec_fixture`,
      });
    }
    if (url.pathname === "/v1/links/exchange") return Response.json(state.link);
    if (options?.method === "DELETE")
      return new Response(null, { status: 204 });
    if (url.pathname.startsWith("/v1/links/"))
      return Response.json({ ...state.link, link_token: null });
    expect(url.searchParams.get("link_token")).toBe(state.link.link_token);
    await onRead(url);
    const isMovements = url.pathname.endsWith("/movements");
    if (isMovements) {
      expect(url.searchParams.get("since")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(url.searchParams.get("until")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    if (isMovements && state.failMovements)
      return new Response("private-provider-error", { status: 503 });
    if (isMovements && state.invalidMovement)
      return Response.json([{ ...fintocMovement, amount: 1.5 }]);
    const items = isMovements
      ? (state.movements[url.pathname.split("/")[3]] ?? [])
      : state.accounts;
    const page = Number(url.searchParams.get("page"));
    return Response.json(items.slice((page - 1) * 300, page * 300), {
      headers: { "X-Total-Count": String(items.length) },
    });
  });
  const api = await startApi(f, false, fetch);
  const first = api.client(),
    other = api.client(f.otherToken);
  const connect = async (connectionId?: string) => {
    const intent = await first.banking.createLinkIntent.mutate({
      holderType: "individual",
      ...(connectionId ? { connectionId } : {}),
    });
    return first.banking.completeLink.mutate({
      id: intent.id,
      exchangeToken: `${intent.widgetToken.split("_sec_")[0]}_exc_fixture`,
    });
  };
  const connected = await connect().catch(async (error: unknown) => {
    await api.app.close();
    await f.db.close();
    throw error;
  });
  fetch.mockClear();
  return {
    ...f,
    ...api,
    first,
    other,
    connected,
    state,
    fetch,
    onRead,
    connect,
    run: () => first.banking.importInitial.mutate({ id: connected.id }),
    async close() {
      await api.app.close();
      await f.db.close();
    },
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function account(f: Setup, externalId = "acc_checking") {
  return (
    await f.db.rows("account", {
      providerConnectionId: f.connected.id,
      externalId,
    })
  )[0];
}

async function movement(
  f: Setup,
  externalId: string,
  accountExternalId = "acc_checking",
) {
  return (
    await f.db.rows("transaction", {
      accountId: (await account(f, accountExternalId)).id,
      externalId,
    })
  )[0];
}

async function movementIds(f: Setup) {
  const accounts = await f.db.rows("account", {
    providerConnectionId: f.connected.id,
  });
  const groups = await Promise.all(
    accounts.map((row) => f.db.rows("transaction", { accountId: row.id })),
  );
  return groups
    .flat()
    .map((row) => row.id)
    .sort();
}

describe.skipIf(!integration)(
  "owned Fintoc first import through public/private RPC and PostgreSQL",
  () => {
    it("reconciles reported cash, unknown card debt, partial history, uncertain spending and explicitly recognized income; repeat import preserves decisions", async () => {
      const f = await setup();
      try {
        expect(await f.run()).toMatchObject({
          status: "complete",
          report: {
            importedAccounts: 3,
            bookedMovements: 7,
            ignoredPendingMovements: 1,
            ignoredProcessingMovements: 1,
            reversedMovements: 1,
            uncertainMovements: 7,
            unknownCardBalances: ["acc_card"],
            skippedAccounts: [
              { externalId: "acc_usd", reason: "unsupported_currency" },
              { externalId: "acc_line", reason: "unsupported_type" },
            ],
          },
        });
        expect(await f.first.accounts.list.query()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: "checking", balance: "500000.00" }),
            expect.objectContaining({ type: "savings", balance: "150000.00" }),
            expect.objectContaining({ type: "credit_card", balance: null }),
          ]),
        );
        expect(await account(f)).toMatchObject({
          history_completeness: "partial",
          history_from: "2026-11-01",
          last_synced_at: new Date(fintocAccount.refreshed_at),
        });
        expect(await movement(f, "mov_purchase")).toMatchObject({
          amount: "-15000.00",
          booked_on: "2026-11-01",
          booked_precision: "calendar_day",
          booked_at: new Date("2026-11-01T15:00:00Z"),
          merchant: null,
          is_internal_movement: null,
        });
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({
          spending: "0.00",
          receivedIncome: "0.00",
          unresolvedMovementCount: 7,
        });
        expect(
          await f.db.rows("income_receipt", {
            transactionId: (await movement(f, "mov_salary")).id,
          }),
        ).toEqual([]);

        const purchase = await movement(f, "mov_purchase"),
          salary = await movement(f, "mov_salary"),
          charge = await movement(f, "mov_charge", "acc_card");
        for (const id of [purchase.id, salary.id, charge.id])
          await f.first.transactions.setInternalMovement.mutate({
            id,
            isInternalMovement: false,
          });
        for (const [id, owner] of [
          ["mov_own_transfer", "acc_checking"],
          ["mov_transfer_in", "acc_savings"],
          ["mov_card_payment", "acc_checking"],
          ["mov_payment", "acc_card"],
        ])
          await f.first.transactions.setInternalMovement.mutate({
            id: (await movement(f, id, owner)).id,
            isInternalMovement: true,
          });
        const source = await f.first.income.createSource.mutate({
          name: "Salary",
          regularity: "irregular",
          amountKind: "variable",
          startDate: "2026-01-01",
        });
        await f.first.income.confirm.mutate({
          transactionId: salary.id,
          sourceId: source.id,
        });
        const tag = await f.persistence
          .user(f.userId)
          .tags.create.mutate({ name: "Personal" });
        await f.persistence.user(f.userId).tagRules.manual.mutate({
          transactionId: purchase.id,
          tagId: tag.id,
        });
        await f.db.update("account", (await account(f)).id, {
          alias: "Keep this alias",
        });
        const ids = await movementIds(f);
        expect(await f.run()).toMatchObject({
          status: "complete",
          conflictCount: 0,
        });
        expect(await movementIds(f)).toEqual(ids);
        expect(await movement(f, "mov_purchase")).toMatchObject({
          id: purchase.id,
          tag_id: tag.id,
          user_internal_override: false,
        });
        expect(await account(f)).toMatchObject({
          alias: "Keep this alias",
          balance: "500000.00",
        });
        expect(
          await f.db.rows("income_receipt", { transactionId: salary.id }),
        ).toHaveLength(1);
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({
          spending: "17000.00",
          receivedIncome: "750000.00",
          unresolvedMovementCount: 0,
        });

        // A compatible provider correction changes the confirmed receipt's
        // current amount, never the separately reported source balance.
        const salaryFact = f.state.movements.acc_checking.find(
          (row) => row.id === "mov_salary",
        );
        if (!salaryFact) throw new Error("Missing salary fixture");
        salaryFact.amount = 800_000;
        expect(await f.run()).toMatchObject({
          status: "complete",
          conflictCount: 0,
        });
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({ receivedIncome: "800000.00", spending: "17000.00" });
        expect(await account(f)).toMatchObject({ balance: "500000.00" });
        salaryFact.status = "reversed";
        expect(await f.run()).toMatchObject({
          status: "needs_review",
          conflictCount: 1,
        });
        expect(
          await f.db.rows("income_receipt", { transactionId: salary.id }),
        ).toHaveLength(1);
        expect(
          await f.first.summaries.monthly.query({ month: "2026-11" }),
        ).toMatchObject({ receivedIncome: "0.00", spending: "17000.00" });
        expect(await movement(f, "mov_purchase")).toMatchObject({
          tag_id: tag.id,
          user_internal_override: false,
        });
      } finally {
        await f.close();
      }
    });

    it("rejects anonymous/foreign references before provider I/O and never leaks credentials in results", async () => {
      const f = await setup();
      try {
        await expect(
          f.client("").banking.importInitial.mutate({ id: f.connected.id }),
        ).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
        await expect(
          f.other.banking.importInitial.mutate({ id: f.connected.id }),
        ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
        expect(f.fetch).not.toHaveBeenCalled();
        const result = await f.run();
        expect(JSON.stringify(result)).not.toMatch(
          /link_token|credential|token_fixture|sk_test|checkpoint/,
        );
        expect(await f.other.accounts.list.query()).toEqual([]);
        expect(await f.other.transactions.list.query({})).toMatchObject({
          items: [],
        });
      } finally {
        await f.close();
      }
    });

    it("never commits inventory or an early movement page after a later failure, and retains last-good source facts on retry", async () => {
      const f = await setup();
      try {
        f.state.movements.acc_checking = Array.from(
          { length: 301 },
          (_, i) => ({ ...fintocMovement, id: `mov_${i}` }),
        );
        f.onRead.mockImplementation(async (url) => {
          if (
            url.pathname.endsWith("/movements") &&
            url.searchParams.get("page") === "2"
          )
            f.state.failMovements = true;
        });
        expect(await f.run()).toMatchObject({
          status: "failed",
          reason: "retryable",
        });
        expect(
          await f.db.rows("account", { providerConnectionId: f.connected.id }),
        ).toEqual([]);
        const failed = (
          await f.db.rows("provider_sync_state", {
            providerConnectionId: f.connected.id,
          })
        )[0];
        expect(failed.last_success_at).toBeNull();
        expect(failed.checkpoint).toBeNull();
        f.onRead.mockReset();
        f.state.failMovements = false;
        expect(await f.run()).toMatchObject({ status: "complete" });
        const good = (
          await f.db.rows("provider_sync_state", {
            providerConnectionId: f.connected.id,
          })
        )[0];
        f.state.accounts[0] = {
          ...fintocAccount,
          balance: { current: 1_000_000 },
          refreshed_at: "2026-11-09T14:00:00.000Z",
        };
        f.state.invalidMovement = true;
        expect(await f.run()).toMatchObject({
          status: "failed",
          reason: "invalid_data",
        });
        expect(await account(f)).toMatchObject({
          balance: "500000.00",
          last_synced_at: new Date(fintocAccount.refreshed_at),
        });
        expect(
          (
            await f.db.rows("provider_sync_state", {
              providerConnectionId: f.connected.id,
            })
          )[0],
        ).toMatchObject({
          checkpoint: good.checkpoint,
          last_success_at: good.last_success_at,
        });
      } finally {
        await f.close();
      }
    });

    it("preserves known balances/freshness on older or undated source snapshots and does not infer deletions from missing history", async () => {
      const f = await setup();
      try {
        await f.run();
        const purchase = await movement(f, "mov_purchase");
        for (const refreshed_at of ["2026-11-07T14:00:00.000Z", null]) {
          f.state.accounts[0] = {
            ...fintocAccount,
            refreshed_at,
            balance: { current: 1 },
          };
          f.state.movements.acc_checking = [];
          expect(await f.run()).toMatchObject({ status: "complete" });
          expect(await account(f)).toMatchObject({
            balance: "500000.00",
            last_synced_at: new Date(fintocAccount.refreshed_at),
          });
          expect(await movement(f, "mov_purchase")).toMatchObject({
            id: purchase.id,
            removed_at: null,
          });
        }
      } finally {
        await f.close();
      }
    });

    it("rejects a relink in the secret-read/begin gap without fetching the old token or recording a new attempt", async () => {
      const f = await setup();
      const ingestion = f.app.get(BankingIngestionService);
      const original = ingestion.syncForUser.bind(ingestion);
      try {
        vi.spyOn(ingestion, "syncForUser").mockImplementationOnce(
          async (...args) => {
            f.state.link.link_token = `${f.state.link.id}_token_new`;
            await f.connect(f.connected.id);
            f.fetch.mockClear();
            return original(...args);
          },
        );
        expect(await f.run()).toEqual({ status: "superseded" });
        expect(f.fetch).not.toHaveBeenCalled();
        expect(
          await f.db.rows("provider_sync_state", {
            providerConnectionId: f.connected.id,
          }),
        ).toEqual([]);
        const current = await f.persistence
          .user(f.userId)
          .providerLinks.connection.query({ id: f.connected.id });
        await expect(
          f.persistence.user(f.userId).providerSync.begin.mutate({
            connectionId: f.connected.id,
            provider: "fintoc",
          }),
        ).rejects.toThrow("credential snapshot");
        expect(current.version).toBe(1);
      } finally {
        vi.restoreAllMocks();
        await f.close();
      }
    });

    it.each([
      "relink",
      "disconnect",
    ] as const)("supersedes a %s during provider I/O without writing financial data", async (action) => {
      const f = await setup();
      try {
        f.onRead.mockImplementationOnce(async () => {
          if (action === "relink") {
            f.state.link.link_token = `${f.state.link.id}_token_new`;
            await f.connect(f.connected.id);
          } else
            await f.first.banking.disconnect.mutate({ id: f.connected.id });
        });
        expect(await f.run()).toEqual({ status: "superseded" });
        expect(
          await f.db.rows("account", { providerConnectionId: f.connected.id }),
        ).toEqual([]);
        expect(
          (
            await f.db.rows("provider_sync_state", {
              providerConnectionId: f.connected.id,
            })
          )[0].last_success_at,
        ).toBeNull();
      } finally {
        await f.close();
      }
    });
  },
);
