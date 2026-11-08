import type {
  BudgetProgress,
  IncomeSummary,
  MonthlyComparison,
  MonthlySummary,
  RecentTransaction,
} from "@lazyfinance/contracts";
import {
  type BudgetContributionsInput,
  type SavingsEvidenceInput,
  type SavingsProgressInput,
  SavingsProgressSchema,
  type SpendingContributionsInput,
  SpendingContributionsPageSchema,
} from "@lazyfinance/contracts";
import { INestApplication, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MCP_STRATEGY, McpStrategy } from "@rekog/mcp-nest";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AccountsService } from "../../../src/accounts/accounts.service";
import { AppModule } from "../../../src/app.module";
import { AuthService } from "../../../src/auth/auth.service";
import { SpendingEvidenceService } from "../../../src/finance/spending-evidence.service";
import { IncomeService } from "../../../src/income/income.service";
import { ObjectivesService } from "../../../src/objectives/objectives.service";
import { SavingsProgressService } from "../../../src/objectives/savings-progress.service";
import { PersistenceClient } from "../../../src/persistence/persistence.client";
import { SummariesService } from "../../../src/summaries/summaries.service";
import { TransactionsService } from "../../../src/transactions/transactions.service";
import { santiagoMonth } from "../../../src/utils/santiago-time";

describe("Dashboard MCP tools", () => {
  let app: INestApplication;
  const accounts = {
    getActiveForUser: vi.fn(async (userId: string) => [
      {
        id: "00000000-0000-4000-8000-000000000011",
        alias: userId,
        type: "checking",
        currency: "CLP",
        balance: "25000.00",
        lastSyncedAt: null,
      },
    ]),
  };
  const recent: RecentTransaction[] = [
    {
      id: "00000000-0000-4000-8000-000000000021",
      bookedAt: "2026-09-15T15:00:00.000Z",
      amount: "-15000.00",
      type: "debit",
      merchant: "Netflix",
      description: null,
      account: {
        id: "00000000-0000-4000-8000-000000000011",
        alias: "Tarjeta",
        type: "credit_card",
        currency: "CLP",
      },
      tag: {
        id: "00000000-0000-4000-8000-000000000031",
        name: "Suscripciones",
        color: null,
      },
      tagDecisionOrigin: "manual",
      tagRuleId: null,
      reviewStatus: "clear",
    },
    {
      id: "00000000-0000-4000-8000-000000000022",
      bookedAt: "2026-09-14T15:00:00.000Z",
      amount: "-10000.00",
      type: "debit",
      merchant: "Almuerzo",
      description: null,
      account: {
        id: "00000000-0000-4000-8000-000000000011",
        alias: "Tarjeta",
        type: "credit_card",
        currency: "CLP",
      },
      tag: null,
      tagDecisionOrigin: "unreviewed",
      tagRuleId: null,
      reviewStatus: "clear",
    },
  ];
  const transactions = { getRecentForUser: vi.fn(async () => recent) };
  const objectives = {
    getForUser: vi.fn(async () => []),
    getSpendingProgressForUser: vi.fn(
      async (_userId: string, month: string): Promise<BudgetProgress[]> => [
        {
          id: "00000000-0000-4000-8000-000000000041",
          revisionId: "00000000-0000-4000-8000-000000000042",
          name: "Budget",
          month,
          period: "monthly",
          limit: "20000.00",
          grossSpent: "18000.00",
          refunds: "2000.00",
          reimbursements: "1000.00",
          spent: "15000.00",
          remaining: "5000.00",
          percentage: 75,
          unresolvedAdjustmentCount: 0,
          adjustmentsAsOf: "2026-11-07T15:00:00Z",
          tracking: {
            start: "2026-09-01T04:00:00Z",
            end: "2026-10-01T03:00:00Z",
            archivedAt: null,
          },
        },
      ],
    ),
  };
  const savingsResult = SavingsProgressSchema.parse({
    goal: {
      id: "00000000-0000-4000-8000-000000000041",
      name: "Savings",
      amount: "100.00",
      kind: "amount_based",
      intent: "saving",
      isRecurring: null,
      period: null,
      startDate: null,
      endDate: null,
      tags: [],
      version: 1,
      revisionId: "00000000-0000-4000-8000-000000000042",
      archivedAt: null,
    },
    month: "2026-09",
    period: "cumulative",
    basis: "recorded_allocations",
    tracking: {
      start: null,
      end: "2026-10-01T03:00:00Z",
      asOf: "2026-09-30T15:00:00Z",
      archivedAt: null,
      empty: false,
    },
    contributions: "30.00",
    withdrawals: "10.00",
    netContributions: "20.00",
    remaining: "80.00",
    percentage: "20.00",
    contributionCount: 1,
    withdrawalCount: 1,
    pendingCount: 0,
    historyCoverage: [],
  });
  const savings = {
    progress: vi.fn(
      async (_userId: string, _input: SavingsProgressInput) => savingsResult,
    ),
    evidence: vi.fn(async (_userId: string, _input: SavingsEvidenceInput) => ({
      items: [],
      pageInfo: { hasMore: false, nextCursor: null },
      tracking: savingsResult.tracking,
      goalVersion: 1,
    })),
  };
  const evidenceResult = SpendingContributionsPageSchema.parse({
    items: [],
    pageInfo: { hasMore: false, nextCursor: null },
    month: "2026-09",
    basis: "purchase_attribution",
    includesUntagged: true,
    totals: {
      grossSpending: "0.00",
      refunds: "0.00",
      reimbursements: "0.00",
      spending: "0.00",
      count: 0,
      unresolvedAdjustmentCount: 0,
    },
    untaggedInSelection: {
      grossSpending: "0.00",
      refunds: "0.00",
      reimbursements: "0.00",
      spending: "0.00",
      count: 0,
      unresolvedAdjustmentCount: 0,
    },
    tracking: {
      start: "2026-09-01T04:00:00Z",
      end: "2026-10-01T03:00:00Z",
      asOf: "2026-09-30T15:00:00Z",
      adjustmentsAsOf: "2026-11-07T15:00:00Z",
      archivedAt: null,
      revisionId: null,
    },
  });
  const evidence = {
    summary: vi.fn(
      async (_userId: string, _input: SpendingContributionsInput) =>
        evidenceResult,
    ),
    budget: vi.fn(
      async (_userId: string, _input: BudgetContributionsInput) =>
        evidenceResult,
    ),
  };
  const summaries = {
    getMonthlyForUser: vi.fn(
      async (_userId: string, month: string): Promise<MonthlySummary> => ({
        month,
        receivedIncome: "1379000.00",
        expectedIncome: {
          amount: "1500000.00",
          estimatedAmount: "0.00",
          unknownAmountCount: 0,
          paymentCount: 1,
        },
        unclassifiedCredits: { amount: "0.00", count: 0 },
        spending: "15000.00",
        grossSpending: "18000.00",
        refunds: "2000.00",
        reimbursements: "1000.00",
        unresolvedAdjustmentCount: 0,
        recoveredExpenseCredits: {
          amount: "4000.00",
          count: 1,
          needsReviewCount: 0,
        },
        adjustmentsAsOf: "2026-11-07T15:00:00Z",
        tags: [],
      }),
    ),
    getComparisonForUser: vi.fn(
      async (_userId: string, month: string): Promise<MonthlyComparison> => ({
        month,
        previousMonth: "2026-08",
        partial: false,
        receivedIncome: {
          current: "1379000.00",
          previous: "1250000.00",
          change: "129000.00",
        },
        spending: {
          current: "15000.00",
          previous: "10000.00",
          change: "5000.00",
        },
      }),
    ),
  };
  const income = {
    getSummaryForUser: vi.fn(
      async (
        _userId: string,
        month = santiagoMonth(new Date()),
      ): Promise<IncomeSummary> => ({
        month,
        currency: "CLP",
        asOf: new Date().toISOString(),
        expectedIncome: {
          amount: "1500000.00",
          estimatedAmount: "0.00",
          unknownAmountCount: 0,
          paymentCount: 1,
        },
        receivedIncome: "0.00",
        unclassifiedCredits: { amount: "10000.00", count: 1 },
        recoveredExpenseCredits: {
          amount: "4000.00",
          count: 1,
          needsReviewCount: 0,
        },
        expectedPayments: [
          {
            sourceId: "00000000-0000-4000-8000-000000000051",
            sourceName: "Sueldo",
            expectationId: null,
            date: `${month}-25`,
            amount: "1500000.00",
            amountType: "exact",
          },
        ],
        receipts: [],
      }),
    ),
  };

  function post(token: string, method: string, params?: object) {
    return request(app.getHttpServer())
      .post("/mcp")
      .set("Authorization", `Bearer ${token}`)
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method, ...(params && { params }) });
  }

  function call(token: string, name: string, args: object = {}) {
    return post(token, "tools/call", { name, arguments: args });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PersistenceClient)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({
        authenticate: async (authorization?: string) => {
          const token = authorization?.replace("Bearer ", "");
          if (token !== "alice" && token !== "bob")
            throw new UnauthorizedException();

          return { userId: token, name: token, email: `${token}@example.com` };
        },
      })
      .overrideProvider(AccountsService)
      .useValue(accounts)
      .overrideProvider(TransactionsService)
      .useValue(transactions)
      .overrideProvider(ObjectivesService)
      .useValue(objectives)
      .overrideProvider(SavingsProgressService)
      .useValue(savings)
      .overrideProvider(SpendingEvidenceService)
      .useValue(evidence)
      .overrideProvider(SummariesService)
      .useValue(summaries)
      .overrideProvider(IncomeService)
      .useValue(income)
      .compile();

    app = module.createNestApplication();
    const strategy = app.get<McpStrategy>(MCP_STRATEGY);
    strategy.setHttpAdapter(app.getHttpAdapter());
    app.connectMicroservice({ strategy });
    await app.startAllMicroservices();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("advertises eleven Spanish, read-only tools with discoverable input/output schemas", async () => {
    const initialized = await post("alice", "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mcp-dashboard-test", version: "1.0.0" },
    }).expect(200);
    expect(initialized.body.result.instructions).toContain("America/Santiago");
    expect(initialized.body.result.serverInfo.title).toContain(
      "Finanzas personales",
    );

    const response = await post("alice", "tools/list").expect(200);
    const tools = response.body.result.tools as Array<{
      name: string;
      description: string;
      annotations: {
        title: string;
        readOnlyHint: boolean;
        destructiveHint: boolean;
      };
      inputSchema: { properties?: { month?: { description: string } } };
      outputSchema: { type: string; properties?: Record<string, unknown> };
    }>;
    expect(tools.map(({ name }) => name).sort()).toEqual([
      "comparar_gastos_mensuales",
      "consultar_aportes_ahorro",
      "consultar_avance_ahorro",
      "consultar_avance_presupuestos",
      "consultar_compras_del_gasto",
      "consultar_compras_presupuesto",
      "consultar_ingresos",
      "consultar_movimientos_recientes",
      "consultar_presupuestos_y_metas",
      "consultar_resumen_gastos_mensuales",
      "consultar_saldos_cuentas",
    ]);

    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(90);
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
      });
      expect(tool.annotations.title.length).toBeGreaterThan(5);
      expect(tool.outputSchema, JSON.stringify(tool)).toBeDefined();
      expect(tool.outputSchema.type).toMatch(/object|array/);
    }

    expect(
      tools.find(({ name }) => name === "consultar_resumen_gastos_mensuales")
        ?.inputSchema.properties?.month?.description,
    ).toContain("America/Santiago");
    expect(
      tools.find(({ name }) => name === "consultar_saldos_cuentas")
        ?.outputSchema.type,
    ).toBe("object");

    for (const name of [
      "consultar_resumen_gastos_mensuales",
      "comparar_gastos_mensuales",
    ]) {
      const tool = tools.find((item) => item.name === name);
      expect(tool?.description).toContain("compra original");
      expect(tool?.outputSchema.properties).not.toHaveProperty("income");
      expect(tool?.outputSchema.properties).not.toHaveProperty(
        "receivedIncome",
      );
      expect(tool?.outputSchema.properties).not.toHaveProperty(
        "expectedIncome",
      );
    }
    const spending = tools.find(
      ({ name }) => name === "consultar_resumen_gastos_mensuales",
    );
    expect(spending?.description).toContain("no son ingresos");
    for (const field of [
      "spending",
      "grossSpending",
      "refunds",
      "reimbursements",
      "recoveredExpenseCredits",
      "adjustmentsAsOf",
    ])
      expect(spending?.outputSchema.properties).toHaveProperty(field);
  });

  it("scopes every tool call to the caller and returns validated structured results", async () => {
    const calls: Array<[string, string, object]> = [
      ["consultar_saldos_cuentas", "bob", {}],
      ["consultar_movimientos_recientes", "alice", {}],
      ["consultar_presupuestos_y_metas", "alice", {}],
      ["consultar_avance_presupuestos", "bob", { month: "2026-09" }],
      ["consultar_resumen_gastos_mensuales", "alice", { month: "2026-09" }],
      ["comparar_gastos_mensuales", "bob", { month: "2026-09" }],
      ["consultar_ingresos", "alice", { month: "2026-09" }],
      [
        "consultar_avance_ahorro",
        "bob",
        { id: savingsResult.goal.id, month: "2026-09" },
      ],
      [
        "consultar_aportes_ahorro",
        "alice",
        { id: savingsResult.goal.id, month: "2026-09" },
      ],
      ["consultar_compras_del_gasto", "alice", { month: "2026-09" }],
      [
        "consultar_compras_presupuesto",
        "bob",
        {
          id: savingsResult.goal.id,
          revisionId: savingsResult.goal.revisionId,
          month: "2026-09",
        },
      ],
    ];

    for (const [name, token, args] of calls) {
      const response = await call(token, name, args).expect(200);
      expect(response.body.result, JSON.stringify(response.body)).toBeDefined();
      expect(response.body.result.isError).not.toBe(true);
      expect(response.body.result.structuredContent).toBeDefined();

      if (name === "consultar_saldos_cuentas") {
        expect(response.body.result.structuredContent.accounts[0].alias).toBe(
          token,
        );
      }

      if (name === "consultar_movimientos_recientes") {
        expect(response.body.result.structuredContent.transactions).toEqual(
          recent,
        );
      }

      if (name === "consultar_ingresos") {
        expect(
          response.body.result.structuredContent.expectedIncome.amount,
        ).toBe("1500000.00");
        expect(response.body.result.structuredContent.receivedIncome).toBe(
          "0.00",
        );
        expect(
          response.body.result.structuredContent.unclassifiedCredits.count,
        ).toBe(1);
        expect(
          response.body.result.structuredContent.recoveredExpenseCredits,
        ).toEqual({ amount: "4000.00", count: 1, needsReviewCount: 0 });
      }

      if (name === "consultar_avance_presupuestos") {
        expect(response.body.result.structuredContent.budgets[0]).toMatchObject(
          {
            grossSpent: "18000.00",
            refunds: "2000.00",
            reimbursements: "1000.00",
            spent: "15000.00",
          },
        );
      }

      if (name === "consultar_resumen_gastos_mensuales") {
        expect(response.body.result.structuredContent).toMatchObject({
          grossSpending: "18000.00",
          refunds: "2000.00",
          reimbursements: "1000.00",
          spending: "15000.00",
          recoveredExpenseCredits: { amount: "4000.00", count: 1 },
        });
      }

      if (
        name === "consultar_resumen_gastos_mensuales" ||
        name === "comparar_gastos_mensuales"
      ) {
        expect(response.body.result.structuredContent).not.toHaveProperty(
          "income",
        );
        expect(JSON.stringify(response.body.result)).not.toContain(
          "1379000.00",
        );
        expect(response.body.result.structuredContent.spending).toBeDefined();
      }
    }

    expect(accounts.getActiveForUser).toHaveBeenCalledWith("bob");
    expect(transactions.getRecentForUser).toHaveBeenCalledWith("alice");
    expect(income.getSummaryForUser).toHaveBeenCalledWith("alice", "2026-09");
    expect(objectives.getForUser).toHaveBeenCalledWith("alice");
    expect(savings.progress).toHaveBeenCalledWith("bob", {
      id: savingsResult.goal.id,
      month: "2026-09",
    });
    expect(evidence.summary).toHaveBeenCalledWith("alice", {
      month: "2026-09",
      limit: 25,
    });
    expect(evidence.budget).toHaveBeenCalledWith("bob", {
      id: savingsResult.goal.id,
      revisionId: savingsResult.goal.revisionId,
      month: "2026-09",
      limit: 25,
    });
    expect(savings.evidence).toHaveBeenCalledWith("alice", {
      id: savingsResult.goal.id,
      month: "2026-09",
      limit: 25,
    });
    expect(objectives.getSpendingProgressForUser).toHaveBeenCalledWith(
      "bob",
      "2026-09",
    );
    expect(summaries.getMonthlyForUser).toHaveBeenCalledWith(
      "alice",
      "2026-09",
    );
    expect(summaries.getComparisonForUser).toHaveBeenCalledWith(
      "bob",
      "2026-09",
    );
  });

  it("allows future income expectations while keeping received income separate", async () => {
    const response = await call("alice", "consultar_ingresos", {
      month: "9999-12",
    }).expect(200);
    expect(response.body.result.isError).not.toBe(true);
    expect(response.body.result.structuredContent.month).toBe("9999-12");
    expect(
      response.body.result.structuredContent.expectedPayments[0].date,
    ).toBe("9999-12-25");
    expect(response.body.result.structuredContent.receivedIncome).toBe("0.00");
  });

  it("defaults to the current Santiago month and rejects invalid or future months", async () => {
    const current = await call(
      "alice",
      "consultar_resumen_gastos_mensuales",
    ).expect(200);
    const month = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
    expect(current.body.result.structuredContent.month).toBe(month);
    const invalid = await call("alice", "consultar_avance_presupuestos", {
      month: "2026-13",
    }).expect(200);
    expect(invalid.body.result.isError).toBe(true);
    const callsBefore = summaries.getComparisonForUser.mock.calls.length;
    const future = await call("alice", "comparar_gastos_mensuales", {
      month: "9999-12",
    }).expect(200);
    expect(future.body.result.isError).toBe(true);
    expect(future.body.result.content[0].text).toContain("no puede ser futuro");
    expect(summaries.getComparisonForUser).toHaveBeenCalledTimes(callsBefore);
  });

  it("does not expose tool data to unauthenticated callers", async () => {
    await request(app.getHttpServer())
      .post("/mcp")
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      .expect(401);
  });
});
