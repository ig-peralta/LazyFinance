import "@angular/compiler";
import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { vi } from "vitest";
import { AuthCredentials } from "../app/core/auth/auth-credentials";
import { SessionService } from "../app/core/auth/session.service";
import { RPC_FETCH, RpcClient } from "../app/core/rpc/rpc-client";
import { AccountsData } from "../app/features/accounts/accounts.data";
import { ObjectivesData } from "../app/features/objectives/objectives.data";
import { SummariesData } from "../app/features/summaries/summaries.data";
import { TaggingData } from "../app/features/tagging/tagging.data";
import { TransactionsData } from "../app/features/transactions/transactions.data";
import { API_URL } from "../app/tokens/api-url";

export const principal = {
  userId: "owner-a",
  email: "demo@lazyfinance.cl",
  name: "Camila Rojas",
};

export const emptySummary = {
  month: "2026-09",
  receivedIncome: "0.00",
  spending: "0.00",
  tags: [],
  unresolvedMovementCount: 0,
  expectedIncome: {
    amount: "0.00",
    estimatedAmount: "0.00",
    unknownAmountCount: 0,
    paymentCount: 0,
  },
  unclassifiedCredits: { amount: "0.00", count: 0 },
};

export const emptyComparison = {
  month: "2026-09",
  previousMonth: "2026-08",
  partial: false,
  receivedIncome: { current: "0.00", previous: "0.00", change: "0.00" },
  spending: { current: "0.00", previous: "0.00", change: "0.00" },
  unresolvedMovementCount: { current: 0, previous: 0 },
};

export const tag = {
  id: "00000000-0000-4000-8000-000000000031",
  name: "Comida",
  color: "#22AA77",
};

export const movement = {
  id: "00000000-0000-4000-8000-000000000012",
  bookedAt: "2026-10-14T15:00:00.000Z",
  amount: "-15000.00",
  type: "debit" as const,
  merchant: "Mercado",
  description: null,
  account: {
    id: "00000000-0000-4000-8000-000000000022",
    alias: "Cuenta",
    type: "checking" as const,
    currency: "CLP" as const,
  },
  tag: null,
  tagDecisionOrigin: "unreviewed" as const,
  tagRuleId: null,
  reviewStatus: "clear" as const,
};

export interface RpcCall {
  procedure: string;
  input: unknown;
  authorization: string | null;
  options?: RequestInit;
}

export type RpcHandler = (
  input: unknown,
  call: RpcCall,
) => unknown | Promise<unknown>;

export type RpcHandlers = Record<string, RpcHandler>;

export const rpcResponse = (data: unknown) =>
  new Response(JSON.stringify({ result: { data } }), {
    headers: { "content-type": "application/json" },
  });

export function rpcFailure(
  code = "SERVICE_UNAVAILABLE",
  status = 503,
): Response {
  return new Response(
    JSON.stringify({
      error: {
        message: code,
        code: status === 401 ? -32001 : -32003,
        data: { code, httpStatus: status },
      },
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

export function createRpcFetch(overrides: RpcHandlers = {}) {
  const handlers: RpcHandlers = {
    "auth.config": () => ({ provider: "mock" }),
    "auth.principal": () => principal,
    "auth.loginMock": () => ({ token: "mock-token" }),
    "accounts.list": () => [],
    "transactions.recent": () => [],
    "objectives.list": () => [],
    "objectives.progress": () => [],
    "summaries.monthly": () => emptySummary,
    "summaries.comparison": () => emptyComparison,
    "tags.list": () => [tag],
    "tags.suggestions": () => [],
    "tags.create": (input) => ({
      ...tag,
      name: (input as { name: string }).name,
    }),
    "tags.decide": (input) => ({
      ...(input as object),
      origin: "manual",
      ruleId: null,
      decidedAt: "2026-10-15T15:00:00.000Z",
    }),
    "tags.reset": (input) => ({
      transactionId: (input as { id: string }).id,
      tagId: null,
      origin: "unreviewed",
      ruleId: null,
      decidedAt: null,
    }),
    "tagRules.create": () => ({ id: "rule" }),
    ...overrides,
  };
  const calls: RpcCall[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, options) => {
    const parsed = new URL(String(url));
    const procedure = parsed.pathname.replace("/trpc/", "");
    const input = options?.body
      ? JSON.parse(String(options.body))
      : JSON.parse(parsed.searchParams.get("input") ?? "null");
    const call = {
      procedure,
      input,
      authorization: new Headers(options?.headers).get("authorization"),
      options,
    };
    calls.push(call);
    const handler = handlers[procedure];
    if (!handler) throw new Error(`Unexpected test RPC: ${procedure}`);

    const value = await handler(input, call);

    return value instanceof Response ? value : rpcResponse(value);
  });

  return {
    fetch,
    handlers,
    calls,
    callsTo: (procedure: string) =>
      calls.filter((call) => call.procedure === procedure),
  };
}

export function setupRpc(
  overrides: RpcHandlers = {},
  platform = "browser",
  authenticated = true,
) {
  const mock = createRpcFetch(overrides);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: API_URL, useValue: "http://api.test" },
      { provide: PLATFORM_ID, useValue: platform },
      { provide: RPC_FETCH, useValue: mock.fetch },
      AccountsData,
      ObjectivesData,
      SummariesData,
      TaggingData,
      TransactionsData,
    ],
  });
  const credentials = TestBed.inject(AuthCredentials);

  if (authenticated) credentials.accept(principal, "alice");

  const navigate = vi
    .spyOn(TestBed.inject(Router), "navigateByUrl")
    .mockResolvedValue(true);
  const session = TestBed.inject(SessionService);

  return {
    ...mock,
    credentials,
    navigate,
    session,
    rpc: TestBed.inject(RpcClient),
  };
}
