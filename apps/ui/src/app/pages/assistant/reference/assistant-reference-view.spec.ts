import type {
  AssistantSource,
  FinancialReadName,
} from "@lazyfinance/contracts";
import { describe, expect, it } from "vitest";
import {
  assistantAccount,
  assistantSource,
} from "../../../../testing/assistant";
import {
  budgetProgress,
  emptyComparison,
  emptySummary,
  incomeSummary,
  movement,
  savingsGoal,
  savingsProgress,
  tag,
  transactionDetail,
  transactionPage,
} from "../../../../testing/rpc";
import { assistantReferenceView } from "./assistant-reference-view";

const totals = {
  count: 1,
  spending: "12000.00",
  grossSpending: "15000.00",
  refunds: "2000.00",
  reimbursements: "1000.00",
  unresolvedAdjustmentCount: 1,
};
const spendingPage = {
  month: "2026-09",
  basis: "purchase_attribution",
  items: [{ ...movement, ...totals }],
  pageInfo: { nextCursor: "another-page", hasMore: true },
  tracking: {
    start: "2026-09-01T04:00:00.000Z",
    end: "2026-10-01T03:00:00.000Z",
    asOf: "2026-09-30T20:00:00.000Z",
    adjustmentsAsOf: "2026-11-01T00:00:00.000Z",
    archivedAt: null,
    revisionId: budgetProgress.revisionId,
  },
  totals,
  untaggedInSelection: totals,
  includesUntagged: true,
};

describe("human-readable financial reference projections", () => {
  it.each([
    "paused",
    "disconnected",
  ])("labels supplied %s tracking metadata as last-known facts", (trackingStatus) => {
    const view = assistantReferenceView(
      assistantSource({
        data: { accounts: [{ ...assistantAccount, trackingStatus }] },
      }),
    );
    expect(view.rows[0].detail).toContain("último saldo conocido");
    expect(view.rows[0].detail).toContain(
      trackingStatus === "paused"
        ? "Seguimiento pausado"
        : "Conexión desconectada",
    );
  });

  it("preserves cash/card distinctions, unknown amounts and exact large-money formatting without aggregating accounts", () => {
    const view = assistantReferenceView(
      assistantSource({
        data: {
          accounts: [
            { ...assistantAccount, balance: "9007199254740.99" },
            {
              ...assistantAccount,
              id: savingsGoal.id,
              type: "credit_card",
              balance: "-50000.00",
            },
            { ...assistantAccount, id: budgetProgress.id, balance: null },
            {
              ...assistantAccount,
              id: budgetProgress.revisionId,
              type: "credit_card",
              balance: "unknown",
            },
          ],
        },
      }),
    );
    expect(view.metrics).toEqual([]);
    expect(view.rows.map((row) => row.value)).toEqual([
      "$9.007.199.254.740,99",
      "$50.000",
      "—",
      "—",
    ]);
    expect(view.rows[1].detail).toContain("Saldo adeudado");
    expect(view.rows[2].detail).toContain("Saldo no disponible");
    expect(view.rows[0].detail).toContain("Sin información de actualización");
  });

  it("presents income plans, included estimates and received amounts separately, with unknowns and the receipt cutoff", () => {
    const view = assistantReferenceView(
      assistantSource({
        tool: "consultar_ingresos",
        path: "/ingresos",
        data: {
          ...incomeSummary,
          expectedIncome: {
            amount: "1500000.00",
            estimatedAmount: "250000.00",
            paymentCount: 3,
            unknownAmountCount: 1,
          },
          receivedIncome: "1000000.00",
        },
      }),
    );
    expect(view.metrics).toEqual([
      { label: "Plan con importe conocido", value: "$1.500.000" },
      { label: "Recibido confirmado", value: "$1.000.000" },
      { label: "Estimaciones incluidas en el plan", value: "$250.000" },
    ]);
    expect(view.notices.join(" ")).toContain(
      "no se suman ni representan dinero disponible",
    );
    expect(view.notices.join(" ")).toContain("1 pago con importe por definir");
    expect(view.period).toContain("noviembre");
    expect(view.link).toBe("/ingresos");
  });

  it("shows gross/net spending and recoveries from the service without summing tag rows or hiding untagged coverage", () => {
    const view = assistantReferenceView(
      assistantSource({
        tool: "consultar_resumen_gastos_mensuales",
        path: "/movimientos",
        data: { ...emptySummary, ...totals },
      }),
    );
    expect(view.metrics.map((metric) => metric.value)).toEqual([
      "$12.000",
      "$15.000",
      "$2.000",
      "$1.000",
    ]);
    expect(view.notices.join(" ")).toContain("compras sin etiqueta");
    expect(view.notices.join(" ")).toContain("por revisar");
    expect(view.period).toBe("septiembre de 2026");
  });

  it("retains partial-equivalent comparison periods and backend-calculated changes", () => {
    const view = assistantReferenceView(
      assistantSource({
        tool: "comparar_gastos_mensuales",
        data: {
          ...emptyComparison,
          partial: true,
          spending: {
            current: "100000.00",
            previous: "120000.00",
            change: "-20000.00",
          },
          receivedIncome: {
            current: "130000.00",
            previous: "110000.00",
            change: "20000.00",
          },
        },
      }),
    );
    expect(view.metrics.map((metric) => metric.value)).toEqual([
      "$100.000",
      "$120.000",
      "-$20.000",
      "$130.000",
      "$20.000",
    ]);
    expect(view.notices[0]).toContain("parciales equivalentes");
  });

  it("shows monthly budget limits without fabricating a total for overlapping tags", () => {
    const view = assistantReferenceView(
      assistantSource({
        tool: "consultar_total_presupuestado_mes",
        path: "/presupuestos-y-metas",
        data: {
          month: "2026-09",
          asOf: "2026-11-01T00:00:00.000Z",
          total: null,
          totalReason: "overlapping_tags",
          budgetCount: 1,
          hasMore: false,
          budgets: [
            {
              id: budgetProgress.id,
              name: "Compras",
              period: "monthly",
              limit: "10000.00",
              spent: "5000.00",
              remaining: "5000.00",
              tags: [tag],
              start: "2026-09-01 00:00:00",
              end: "2026-10-01 00:00:00",
              archivedAt: null,
            },
          ],
        },
      }),
    );
    expect(view.metrics).toEqual([]);
    expect(view.rows[0]).toMatchObject({
      value: "$10.000",
      link: `/presupuestos/${budgetProgress.id}`,
    });
    expect(view.notices.join(" ")).toContain("no hay un total mensual único");
  });

  it("keeps monthly goal allocations distinct from the income-spending difference", () => {
    const monthly = assistantReferenceView(
      assistantSource({
        tool: "consultar_aportes_mensuales_meta",
        path: "/metas",
        data: {
          id: savingsGoal.id,
          name: savingsGoal.name,
          month: "2026-09",
          basis: "recorded_allocations",
          tracking: {
            start: "2026-09-01T04:00:00.000Z",
            end: "2026-10-01T03:00:00.000Z",
            asOf: "2026-11-01T00:00:00.000Z",
            archivedAt: null,
            empty: false,
          },
          historyCoverage: [],
          incompleteCoverage: false,
          contributions: "9000.00",
          withdrawals: "1000.00",
          netContributions: "8000.00",
          pendingCount: 0,
        },
      }),
    );
    expect(monthly.metrics[0]).toEqual({
      label: "Asignación neta del mes",
      value: "$8.000",
    });
    expect(monthly.notices.join(" ")).toContain("No es un saldo bancario");
    const difference = assistantReferenceView(
      assistantSource({
        tool: "consultar_diferencia_ingresos_gastos_mes",
        path: "/movimientos",
        data: {
          ...totals,
          month: "2026-09",
          asOf: "2026-11-01T00:00:00.000Z",
          adjustmentsAsOf: "2026-11-01T00:00:00.000Z",
          receivedIncome: "15000.00",
          difference: "3000.00",
          unclassifiedCredits: { amount: "0.00", count: 0 },
          unresolvedMovementCount: 0,
          basis: "confirmed_income_minus_recorded_spending",
        },
      }),
    );
    expect(difference.metrics[2]).toEqual({
      label: "Diferencia",
      value: "$3.000",
    });
    expect(difference.notices.join(" ")).toContain(
      "No representa efectivo ahorrado",
    );
  });

  it("never calls an observed recurring pattern a verified subscription or upcoming bill", () => {
    const view = assistantReferenceView(
      assistantSource({
        tool: "consultar_cargos_recurrentes_observados",
        path: "/movimientos",
        data: {
          through: "2026-09",
          months: 6,
          asOf: "2026-11-01T00:00:00.000Z",
          basis: "observed_merchant_pattern",
          hasMore: false,
          candidates: [
            {
              merchant: "streamflix",
              observedMonths: 3,
              total: "30000.00",
              lastObservedMonth: "2026-09",
            },
          ],
        },
      }),
    );
    expect(view.rows[0].detail).toContain("Suma observada");
    expect(view.notices[0]).toContain("no suscripciones verificadas");
  });

  it("shows partial calendar ranges and month-specific account coverage", () => {
    const range = assistantReferenceView(
      assistantSource({
        tool: "consultar_gastos_rango_fechas",
        path: "/movimientos",
        data: {
          from: "2026-11-01",
          before: "2026-11-23",
          partial: true,
          asOf: "2026-11-22T16:00:00.000Z",
          adjustmentsAsOf: "2026-11-22T16:00:00.000Z",
          grossSpending: "20.00",
          refunds: "0.00",
          reimbursements: "0.00",
          spending: "20.00",
          unresolvedAdjustmentCount: 0,
          unresolvedMovementCount: 0,
        },
      }),
    );
    expect(range.metrics[0]).toMatchObject({
      label: "Gasto neto",
      value: "$20",
    });
    expect(range.notices[0]).toContain("Hoy está incluido parcialmente");
    const coverage = assistantReferenceView(
      assistantSource({
        tool: "consultar_cobertura_datos_financieros",
        path: "/cuentas",
        data: {
          month: "2026-09",
          asOf: "2026-11-22T16:00:00.000Z",
          unresolvedMovementCount: 2,
          unclassifiedCreditCount: 1,
          accounts: [
            {
              id: assistantAccount.id,
              alias: "Cuenta ahorro",
              type: "savings",
              trackingStatus: "paused",
              lastSyncedAt: "2026-08-01T12:00:00.000Z",
              historyCompleteness: "complete",
              historyFrom: "2026-10-01",
              historyThrough: "2026-11-22",
              monthCovered: false,
            },
          ],
        },
      }),
    );
    expect(coverage.rows[0]).toMatchObject({
      title: "Cuenta ahorro",
      value: "Mes sin cobertura completa",
    });
    expect(coverage.rows[0].detail).toContain("pausado");
    expect(coverage.notices[0]).toContain("2 movimientos sin resolver");
  });

  it("does not turn a declared goal into measured savings or combine overlapping budgets", () => {
    const declarations = assistantReferenceView(
      assistantSource({
        tool: "consultar_presupuestos_y_metas",
        data: { objectives: [savingsGoal] },
      }),
    );
    expect(declarations.rows[0]).toMatchObject({
      detail: "Meta declarada · no es ahorro medido",
      link: `/metas/${savingsGoal.id}`,
    });
    const budgets = assistantReferenceView(
      assistantSource({
        tool: "consultar_avance_presupuestos",
        data: { budgets: [budgetProgress] },
      }),
    );
    expect(budgets.metrics).toEqual([]);
    expect(budgets.rows[0]).toMatchObject({
      value: "$120.000",
      progress: 40,
      link: `/presupuestos/${budgetProgress.id}`,
    });
    expect(budgets.notices[0]).toContain("no se suman ni miden ahorro");
  });

  it("shows measured savings separately from balances and keeps pending/partial coverage visible", () => {
    const view = assistantReferenceView(
      assistantSource({
        tool: "consultar_avance_ahorro",
        path: "/metas",
        data: savingsProgress,
      }),
    );
    expect(view.title).toBe("Fondo de calma");
    expect(view.metrics[0]).toEqual({
      label: "Asignación neta registrada",
      value: "$500.000",
    });
    expect(view.notices.join(" ")).toContain("1 movimiento pendiente");
    expect(view.notices.join(" ")).toContain("parcial o desconocida");
    expect(view.link).toBe(`/metas/${savingsGoal.id}`);
  });

  it("shows recent movements as a bounded preview with owned detail links, not a complete history", () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      ...movement,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    const view = assistantReferenceView(
      assistantSource({
        tool: "consultar_movimientos_recientes",
        data: { transactions: rows },
      }),
    );
    expect(view.rows).toHaveLength(4);
    expect(view.preview).toBe(true);
    expect(view.rows[0].link).toBe(`/movimientos/${rows[0].id}`);
    expect(view.notices[0]).toContain("no del historial completo");
  });

  it("projects action-supporting reads into tag and movement cards, keeping page bounds and current detail links", () => {
    const catalog = assistantReferenceView(
      assistantSource({
        tool: "consultar_etiquetas",
        path: "/etiquetas",
        data: { tags: [tag] },
      }),
    );
    expect(catalog.rows[0]).toMatchObject({
      title: tag.name,
      link: "/etiquetas",
    });
    const page = assistantReferenceView(
      assistantSource({
        tool: "buscar_movimientos",
        path: "/movimientos",
        data: transactionPage([movement], "more"),
      }),
    );
    expect(page.rows[0].link).toBe(`/movimientos/${movement.id}`);
    expect(page.preview).toBe(true);
    const detail = assistantReferenceView(
      assistantSource({
        tool: "consultar_movimiento",
        path: "/movimientos",
        data: transactionDetail,
      }),
    );
    expect(detail.link).toBe(`/movimientos/${movement.id}`);
    expect(detail.notices.join(" ")).toContain("no confirma ingresos");
  });

  it.each([
    "consultar_compras_del_gasto",
    "consultar_compras_presupuesto",
  ] as const)("uses complete service totals and pinned evidence for %s without summing the displayed page", (tool) => {
    const view = assistantReferenceView(
      assistantSource({
        tool,
        path:
          tool === "consultar_compras_presupuesto"
            ? "/presupuestos-y-metas"
            : "/movimientos",
        recordId: budgetProgress.id,
        data: spendingPage,
      }),
    );
    expect(view.metrics[0]).toEqual({
      label: "Gasto neto total",
      value: "$12.000",
    });
    expect(view.preview).toBe(true);
    expect(view.rows[0].value).toBe("$12.000");
    expect(view.notices[0]).toContain("no solo esta página");
    if (tool === "consultar_compras_presupuesto") {
      expect(view.link).toBe(`/presupuestos/${budgetProgress.id}/movimientos`);
      expect(view.query).toEqual({
        month: spendingPage.month,
        revision: budgetProgress.revisionId,
        asOf: spendingPage.tracking.asOf,
        adjustmentsAsOf: spendingPage.tracking.adjustmentsAsOf,
      });
    }
  });

  it("distinguishes pending savings evidence and opens the original goal when its reference carries an owned ID", () => {
    const { account, tagDecisionOrigin, tagRuleId, ...facts } = movement;
    const view = assistantReferenceView(
      assistantSource({
        tool: "consultar_aportes_ahorro",
        path: "/metas",
        recordId: savingsGoal.id,
        data: {
          items: [
            {
              ...facts,
              accountId: account.id,
              accountType: account.type,
              effect: { status: "pending", reason: "movement_review" },
            },
          ],
          pageInfo: { nextCursor: null, hasMore: false },
          tracking: savingsProgress.tracking,
          goalVersion: 1,
        },
      }),
    );
    expect(view.rows[0].detail).toContain("Pendiente de revisión");
    expect(view.link).toBe(`/metas/${savingsGoal.id}`);
    expect(view.notices[0]).toContain("no se suman como un saldo");
  });

  it.each([
    "limited",
    "unavailable",
  ] as const)("does not fabricate zero values or expose JSON for a %s source", (status) => {
    const view = assistantReferenceView(
      assistantSource({ status, data: null }),
    );
    expect(view.metrics).toEqual([]);
    expect(view.rows).toEqual([]);
    expect(view.empty).not.toBeNull();
    expect(view.link).toBe("/cuentas");
  });

  it("does not render technical keys or invent values from an invalid financial result", () => {
    const view = assistantReferenceView(
      assistantSource({ data: { privateTechnicalField: "do not render" } }),
    );
    expect(view.metrics).toEqual([]);
    expect(view.rows).toEqual([]);
    expect(JSON.stringify(view)).not.toContain("privateTechnicalField");
  });

  it("distinguishes genuine empty collections from unknown/unavailable results", () => {
    const cases: { tool: FinancialReadName; data: AssistantSource["data"] }[] =
      [
        { tool: "consultar_saldos_cuentas", data: { accounts: [] } },
        { tool: "consultar_movimientos_recientes", data: { transactions: [] } },
        { tool: "consultar_presupuestos_y_metas", data: { objectives: [] } },
        { tool: "consultar_avance_presupuestos", data: { budgets: [] } },
      ];
    for (const entry of cases)
      expect(assistantReferenceView(assistantSource(entry)).empty).toMatch(
        /^No hay/,
      );
  });
});
