import "@angular/compiler";
import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import type { ApiRouter } from "@lazyfinance/rpc-api";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
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

type Inputs = inferRouterInputs<ApiRouter>;
type Outputs = inferRouterOutputs<ApiRouter>;
type RouterName = keyof Inputs & keyof Outputs & string;

export type RpcProcedure = {
  [Router in RouterName]: `${Router}.${keyof Inputs[Router] & keyof Outputs[Router] & string}`;
}[RouterName];

export type RpcInput<Procedure extends RpcProcedure> =
  Procedure extends `${infer Router extends RouterName}.${infer Method}`
    ? Method extends keyof Inputs[Router]
      ? Inputs[Router][Method]
      : never
    : never;

export type RpcOutput<Procedure extends RpcProcedure> =
  Procedure extends `${infer Router extends RouterName}.${infer Method}`
    ? Method extends keyof Outputs[Router]
      ? Outputs[Router][Method]
      : never
    : never;

export const principal = {
  userId: "owner-a",
  email: "demo@lazyfinance.cl",
  name: "Camila Rojas",
} satisfies RpcOutput<"auth.principal">;

export const emptySummary = {
  month: "2026-09",
  receivedIncome: "0.00",
  spending: "0.00",
  grossSpending: "0.00",
  refunds: "0.00",
  reimbursements: "0.00",
  unresolvedAdjustmentCount: 0,
  recoveredExpenseCredits: { amount: "0.00", count: 0, needsReviewCount: 0 },
  adjustmentsAsOf: "2026-11-07T15:00:00Z",
  tags: [],
  unresolvedMovementCount: 0,
  expectedIncome: {
    amount: "0.00",
    estimatedAmount: "0.00",
    unknownAmountCount: 0,
    paymentCount: 0,
  },
  unclassifiedCredits: { amount: "0.00", count: 0 },
} satisfies RpcOutput<"summaries.monthly">;

export const emptyComparison = {
  month: "2026-09",
  previousMonth: "2026-08",
  partial: false,
  receivedIncome: { current: "0.00", previous: "0.00", change: "0.00" },
  spending: { current: "0.00", previous: "0.00", change: "0.00" },
  unresolvedMovementCount: { current: 0, previous: 0 },
} satisfies RpcOutput<"summaries.comparison">;

export const tag = {
  id: "00000000-0000-4000-8000-000000000031",
  name: "Comida",
  color: "#22AA77",
} satisfies RpcOutput<"tags.create">;

export const account = (name: string): RpcOutput<"accounts.list">[number] => ({
  id: name,
  alias: name,
  type: "checking",
  currency: "CLP",
  balance: "10.00",
  lastSyncedAt: null,
});

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
} satisfies RpcOutput<"transactions.recent">[number];

export const transactionPage = (
  items: RpcOutput<"transactions.list">["items"] = [],
  nextCursor: string | null = null,
): RpcOutput<"transactions.list"> => ({
  items,
  pageInfo: { nextCursor, hasMore: nextCursor !== null },
});

export const transactionDetail = {
  ...movement,
  isInternalMovement: false,
  userInternalOverride: null,
  providerInternalAssessment: "external",
  source: "provider",
  bookedPrecision: "instant",
  bookedOn: null,
  removedAt: null,
  receipt: null,
  hasExpenseAdjustments: false,
} satisfies RpcOutput<"transactions.detail">;

export const incomeSource = {
  id: "00000000-0000-4000-8000-000000000041",
  name: "Sueldo",
  currency: "CLP",
  regularity: "regular",
  amountKind: "fixed",
  expectedAmount: "1500000.00",
  schedule: { frequency: "monthly", day: "last" },
  startDate: "2026-01-01",
  endDate: null,
  archivedAt: null,
  createdAt: "2026-01-01T15:00:00.000Z",
  updatedAt: "2026-01-01T15:00:00.000Z",
} satisfies RpcOutput<"income.createSource">;

export const incomeSummary = {
  month: "2026-11",
  currency: "CLP",
  asOf: "2026-11-08T15:00:00.000Z",
  expectedIncome: emptySummary.expectedIncome,
  receivedIncome: "0.00",
  unclassifiedCredits: { amount: "0.00", count: 0 },
  recoveredExpenseCredits: emptySummary.recoveredExpenseCredits,
  unresolvedMovementCount: 0,
  expectedPayments: [],
  receipts: [],
} satisfies RpcOutput<"income.summary">;

export const budgetRevision = {
  id: "00000000-0000-4000-8000-000000000062",
  budgetId: "00000000-0000-4000-8000-000000000061",
  version: 1,
  name: "Gastos del hogar",
  amount: "300000.00",
  kind: "time_based",
  isRecurring: true,
  period: "monthly",
  startDate: "2020-01-01T03:00:00.000Z",
  endDate: null,
  tags: [tag],
  effectiveFrom: "2020-01-01T03:00:00.000Z",
  recordedAt: "2020-01-01T03:00:00.000Z",
  supersededAt: null,
} satisfies NonNullable<RpcOutput<"objectives.budget">["effective"]>;

export const budgetDetail = {
  id: budgetRevision.budgetId,
  version: 1,
  archivedAt: null,
  effective: budgetRevision,
  pending: null,
} satisfies RpcOutput<"objectives.budget">;

export const budgetProgress = {
  id: budgetDetail.id,
  name: budgetRevision.name,
  month: "2026-11",
  period: "monthly",
  limit: "300000.00",
  spent: "120000.00",
  grossSpent: "150000.00",
  refunds: "20000.00",
  reimbursements: "10000.00",
  unresolvedAdjustmentCount: 0,
  adjustmentsAsOf: "2026-11-07T15:00:00.000Z",
  remaining: "180000.00",
  percentage: 40,
  revisionId: budgetRevision.id,
  tracking: {
    start: "2026-11-01T03:00:00.000Z",
    end: "2026-12-01T03:00:00.000Z",
    archivedAt: null,
  },
} satisfies RpcOutput<"objectives.progress">[number];

export const savingsGoal = {
  id: "00000000-0000-4000-8000-000000000071",
  revisionId: "00000000-0000-4000-8000-000000000072",
  version: 1,
  archivedAt: null,
  intent: "saving",
  name: "Fondo de calma",
  amount: "5000000.00",
  kind: "amount_based",
  isRecurring: null,
  period: null,
  startDate: null,
  endDate: null,
  tags: [tag],
} satisfies RpcOutput<"objectives.savingsGoal">;

export const savingsProgress = {
  goal: savingsGoal,
  month: "2026-11",
  period: "cumulative",
  basis: "recorded_allocations",
  contributions: "600000.00",
  withdrawals: "100000.00",
  netContributions: "500000.00",
  remaining: "4500000.00",
  percentage: "10.00",
  contributionCount: 2,
  withdrawalCount: 1,
  pendingCount: 1,
  tracking: {
    start: null,
    end: "2026-12-01T03:00:00.000Z",
    asOf: "2026-11-07T15:00:00.000Z",
    archivedAt: null,
    empty: false,
  },
  historyCoverage: [
    {
      accountId: movement.account.id,
      completeness: "partial",
      from: "2026-01-01",
      through: "2026-11-07",
    },
  ],
} satisfies RpcOutput<"objectives.savingsProgress">;

export const manualDecision = (
  transactionId = movement.id,
  tagId: string | null = tag.id,
): RpcOutput<"tags.decide"> => ({
  transactionId,
  tagId,
  origin: "manual",
  ruleId: null,
  decidedAt: "2026-10-15T15:00:00.000Z",
});

export interface RpcCall<Procedure extends RpcProcedure = RpcProcedure> {
  procedure: Procedure;
  input: RpcInput<Procedure>;
  authorization: string | null;
  options?: RequestInit;
}

export type RpcHandler<Procedure extends RpcProcedure> = (
  input: RpcInput<Procedure>,
  call: RpcCall<Procedure>,
) => RpcOutput<Procedure> | Response | Promise<RpcOutput<Procedure> | Response>;

export type RpcHandlers = {
  [Procedure in RpcProcedure]?: RpcHandler<Procedure>;
};

/** Raw transport escape hatch for error or intentionally malformed responses. */
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
    "onboarding.state": () => ({ status: "active", completedAt: null }),
    "onboarding.finish": ({ status }) =>
      status === "completed"
        ? { status, completedAt: "2026-11-08T15:00:00.000Z" }
        : { status, completedAt: null },
    "accounts.list": () => [],
    "transactions.recent": () => [],
    "transactions.list": () => transactionPage(),
    "transactions.detail": () => transactionDetail,
    "objectives.list": () => [],
    "objectives.progress": () => [],
    "objectives.savingsProgress": () => savingsProgress,
    "income.sources": () => [],
    "income.summary": () => incomeSummary,
    "summaries.monthly": () => emptySummary,
    "summaries.comparison": () => emptyComparison,
    "tags.list": () => [tag],
    "tags.suggestions": () => [],
    "tags.create": (input) => ({
      ...tag,
      name: input.name,
    }),
    "tags.decide": (input) => manualDecision(input.transactionId, input.tagId),
    "tags.reset": (input) => ({
      transactionId: input.id,
      tagId: null,
      origin: "unreviewed",
      ruleId: null,
      decidedAt: null,
    }),
    "tagRules.create": (input) => ({
      id: "00000000-0000-4000-8000-000000000032",
      tagId: input.tagId,
      accountId: input.accountId ?? null,
      direction: input.direction,
      matchField: input.matchField,
      matchValue: input.matchValue,
      priority: input.priority ?? 0,
      mode: input.autoApply ? "auto" : "suggest",
      approvedAt: input.autoApply ? "2026-10-15T15:00:00.000Z" : null,
      active: true,
      createdAt: "2026-10-15T15:00:00.000Z",
      updatedAt: "2026-10-15T15:00:00.000Z",
    }),
    ...overrides,
  };
  const calls: RpcCall[] = [];

  async function respond<Procedure extends RpcProcedure>(
    procedure: Procedure,
    input: unknown,
    options?: RequestInit,
  ): Promise<Response> {
    const handler = handlers[procedure];
    if (!handler) throw new Error(`Unexpected test RPC: ${procedure}`);

    const call: RpcCall<Procedure> = {
      procedure,
      // The real typed client encodes this request. Keep the JSON assertion at
      // dispatch, rather than erasing types from every handler and recorded call.
      input: input as RpcInput<Procedure>,
      authorization: new Headers(options?.headers).get("authorization"),
      options,
    };
    calls.push(call);
    const value = await handler(call.input, call);

    return value instanceof Response ? value : rpcResponse(value);
  }

  const fetch = vi.fn<typeof globalThis.fetch>(async (url, options) => {
    const parsed = new URL(String(url));
    const procedure = parsed.pathname.replace("/trpc/", "");
    if (!Object.hasOwn(handlers, procedure)) {
      throw new Error(`Unexpected test RPC: ${procedure}`);
    }

    const encoded = options?.body
      ? String(options.body)
      : parsed.searchParams.get("input");
    const input: unknown = encoded == null ? undefined : JSON.parse(encoded);
    return respond(procedure as RpcProcedure, input, options);
  });

  return {
    fetch,
    handlers,
    calls,
    callsTo: <Procedure extends RpcProcedure>(procedure: Procedure) =>
      calls.filter(
        (call): call is RpcCall<Procedure> => call.procedure === procedure,
      ),
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
