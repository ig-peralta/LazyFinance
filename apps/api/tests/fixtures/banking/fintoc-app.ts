import { randomUUID } from "node:crypto";
import { expect, vi } from "vitest";
import type { FintocLink } from "../../../src/banking/fintoc/client/fintoc-client";
import type {
  FintocAccount,
  FintocMovement,
} from "../../../src/banking/fintoc/client/fintoc-snapshot.schema";
import * as historyWindow from "../../../src/banking/fintoc/import/fintoc-history-window";
import { fixture, startApi } from "../persistence";
import { fintocEnvironment, fintocIntent, fintocLink } from "./fintoc";
import {
  fintocAccount,
  fintocHistoryWindow,
  fintocMovement,
} from "./fintoc-snapshot";

/** Real public/private RPC, a mocked provider and a deterministic history window.
 * Freeze this policy only, not Date/JWT clocks shared with real persistence. */
export async function fintocAppFixture() {
  const f = await fixture();
  const window = vi
    .spyOn(historyWindow, "fintocInitialHistoryWindow")
    .mockReturnValue(fintocHistoryWindow);
  f.environment = fintocEnvironment();
  const externalId = `link_${randomUUID().replaceAll("-", "")}`;
  const link: FintocLink = {
    ...fintocLink,
    id: externalId,
    link_token: `${externalId}_token_fixture`,
  };
  const accounts: FintocAccount[] = [
    { ...fintocAccount },
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
      { ...fintocMovement },
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
    failureStatus: 503,
    retryAfter: null as string | null,
    linkFailureStatus: null as number | null,
  };
  const onRead = vi.fn<(url: URL) => Promise<void>>(async () => {});
  const onLink = vi.fn<() => Promise<void>>(async () => {});
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
    if (url.pathname.startsWith("/v1/links/")) {
      const response = state.linkFailureStatus
        ? new Response(null, { status: state.linkFailureStatus })
        : Response.json({ ...state.link, link_token: null });
      await onLink();
      return response;
    }
    expect(url.searchParams.get("link_token")).toBe(state.link.link_token);
    await onRead(url);
    const isMovements = url.pathname.endsWith("/movements");
    if (isMovements) {
      expect(url.searchParams.get("since")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(url.searchParams.get("until")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    if (isMovements && state.failMovements)
      return new Response("private-provider-error", {
        status: state.failureStatus,
        headers: state.retryAfter ? { "Retry-After": state.retryAfter } : {},
      });
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
    window.mockRestore();
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
    onLink,
    connect,
    run: () => first.banking.importInitial.mutate({ id: connected.id }),
    refresh: () => first.banking.refresh.mutate({ id: connected.id }),
    syncStatus: () => first.banking.syncStatus.query({ id: connected.id }),
    async close() {
      await api.app.close();
      await f.db.close();
      window.mockRestore();
    },
  };
}

export type FintocAppFixture = Awaited<ReturnType<typeof fintocAppFixture>>;

export async function fintocStoredAccount(
  f: FintocAppFixture,
  externalId = "acc_checking",
) {
  return (
    await f.db.rows("account", {
      providerConnectionId: f.connected.id,
      externalId,
    })
  )[0];
}

export async function fintocStoredMovement(
  f: FintocAppFixture,
  externalId: string,
  accountExternalId = "acc_checking",
) {
  return (
    await f.db.rows("transaction", {
      accountId: (await fintocStoredAccount(f, accountExternalId)).id,
      externalId,
    })
  )[0];
}

export async function fintocMovementIds(f: FintocAppFixture) {
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
