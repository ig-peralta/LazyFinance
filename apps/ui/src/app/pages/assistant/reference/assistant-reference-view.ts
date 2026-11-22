import {
  AccountSummarySchema,
  type AssistantReadName,
  type AssistantSource,
  BudgetProgressSchema,
  FinancialCoverageSchema,
  IncomeSummarySchema,
  MerchantSpendingSchema,
  MonthlyBudgetPlanSchema,
  MonthlyComparisonSchema,
  MonthlyDifferenceSchema,
  MonthlyGoalAllocationSchema,
  MonthlySummarySchema,
  MonthSchema,
  ObjectiveSummarySchema,
  RecentTransactionSchema,
  RecurringCandidatesSchema,
  SavingsEvidencePageSchema,
  SavingsGoalsOverviewSchema,
  SavingsProgressSchema,
  SpendingContributionsPageSchema,
  SpendingRangeSchema,
  SpendingTrendSchema,
  SpendingVariationSchema,
  TagSummarySchema,
  TransactionDetailSchema,
  TransactionsPageSchema,
} from "@lazyfinance/contracts";
import { z } from "zod";
import { formatClp } from "../../../../utils/currency";
import { formatDate } from "../../../../utils/date";
import { monthLabel } from "../../../../utils/month";
import {
  accountBalanceLabel,
  accountFreshnessLabel,
  accountTypeLabel,
  formatAccountBalance,
} from "../../../features/accounts/account-presentation";
import type { IconName } from "../../../shared/ui/icon";

interface ReferenceRow {
  id: string;
  title: string;
  value: string;
  detail: string;
  link?: string;
  progress?: number;
}

export interface AssistantReferenceView {
  title: string;
  section: string;
  icon: IconName;
  period: string | null;
  metrics: { label: string; value: string }[];
  rows: ReferenceRow[];
  notices: string[];
  empty: string | null;
  preview: boolean;
  link: string;
  query: Record<string, string> | null;
  action: string;
}

const sections: Record<
  AssistantReadName,
  { name: string; icon: IconName; action: string }
> = {
  consultar_etiquetas: {
    name: "Etiquetas",
    icon: "tag",
    action: "Ver etiquetas",
  },
  buscar_movimientos: {
    name: "Movimientos",
    icon: "activity",
    action: "Ver movimientos",
  },
  consultar_movimiento: {
    name: "Movimientos",
    icon: "activity",
    action: "Ver movimiento",
  },
  consultar_saldos_cuentas: {
    name: "Cuentas",
    icon: "wallet",
    action: "Ver cuentas",
  },
  consultar_movimientos_recientes: {
    name: "Movimientos",
    icon: "activity",
    action: "Ver movimientos",
  },
  consultar_presupuestos_y_metas: {
    name: "Planificación",
    icon: "target",
    action: "Ver planificación",
  },
  consultar_avance_presupuestos: {
    name: "Presupuestos",
    icon: "target",
    action: "Ver presupuestos",
  },
  consultar_resumen_gastos_mensuales: {
    name: "Gastos",
    icon: "activity",
    action: "Ver movimientos",
  },
  comparar_gastos_mensuales: {
    name: "Gastos",
    icon: "trend",
    action: "Ver movimientos",
  },
  consultar_ingresos: {
    name: "Ingresos",
    icon: "income",
    action: "Ver ingresos",
  },
  consultar_avance_ahorro: {
    name: "Ahorro",
    icon: "target",
    action: "Ver metas de ahorro",
  },
  consultar_aportes_ahorro: {
    name: "Ahorro",
    icon: "target",
    action: "Ver metas de ahorro",
  },
  consultar_compras_del_gasto: {
    name: "Compras",
    icon: "activity",
    action: "Ver movimientos",
  },
  consultar_compras_presupuesto: {
    name: "Presupuestos",
    icon: "target",
    action: "Ver presupuestos",
  },
  consultar_total_presupuestado_mes: {
    name: "Presupuestos",
    icon: "target",
    action: "Ver presupuestos",
  },
  consultar_aportes_mensuales_meta: {
    name: "Ahorro",
    icon: "target",
    action: "Ver meta",
  },
  consultar_diferencia_ingresos_gastos_mes: {
    name: "Ingresos y gastos",
    icon: "trend",
    action: "Ver movimientos",
  },
  consultar_tendencia_gastos: {
    name: "Gastos",
    icon: "trend",
    action: "Ver movimientos",
  },
  consultar_variacion_gastos_por_etiqueta: {
    name: "Gastos",
    icon: "trend",
    action: "Ver movimientos",
  },
  consultar_gasto_por_comercio: {
    name: "Gastos",
    icon: "activity",
    action: "Ver movimientos",
  },
  consultar_panorama_metas_ahorro: {
    name: "Ahorro",
    icon: "target",
    action: "Ver metas",
  },
  consultar_cobertura_datos_financieros: {
    name: "Cuentas",
    icon: "wallet",
    action: "Ver cuentas",
  },
  consultar_gastos_rango_fechas: {
    name: "Gastos",
    icon: "activity",
    action: "Ver movimientos",
  },
  consultar_cargos_recurrentes_observados: {
    name: "Movimientos",
    icon: "activity",
    action: "Ver movimientos",
  },
};

// Saved evidence may predate account tracking metadata; never strip a supplied status.
const accountsSchema = z.object({
  accounts: z.array(
    AccountSummarySchema.extend({
      trackingStatus: z.enum(["tracked", "paused", "disconnected"]).nullish(),
    }),
  ),
});
const movementsSchema = z.object({
  transactions: z.array(RecentTransactionSchema),
});
const objectivesSchema = z.object({
  objectives: z.array(ObjectiveSummarySchema),
});
const budgetsSchema = z.object({ budgets: z.array(BudgetProgressSchema) });
const spendingSchema = MonthlySummarySchema.pick({
  month: true,
  spending: true,
  grossSpending: true,
  refunds: true,
  reimbursements: true,
  unresolvedAdjustmentCount: true,
  adjustmentsAsOf: true,
  tags: true,
}).extend({
  untaggedSpending: z.string().optional(),
  asOf: z.iso.datetime().optional(),
  unresolvedMovementCount: z.number().int().optional(),
});
const comparisonSchema = MonthlyComparisonSchema.pick({
  month: true,
  previousMonth: true,
  partial: true,
  spending: true,
}).extend({
  receivedIncome: MonthlyComparisonSchema.shape.receivedIncome.optional(),
});

const money = (label: string, value: string) => ({
  label,
  value: formatClp(value),
});
const count = (value: number, singular: string, plural: string) =>
  `${value} ${value === 1 ? singular : plural}`;
const date = (value: string) => formatDate(new Date(value));
const period = (value: string | null) =>
  MonthSchema.safeParse(value).success ? monthLabel(value ?? "") : null;

/** Presentation of validated stored observations only: no new reads, totals or model-authored cards. */
export function assistantReferenceView(
  source: AssistantSource,
  expanded = false,
): AssistantReferenceView {
  const section = sections[source.tool];
  const view: AssistantReferenceView = {
    title: source.title,
    section: section.name,
    icon: section.icon,
    period: period(source.month),
    metrics: [],
    rows: [],
    notices: [],
    empty: "Abre la sección para revisar la información consultada.",
    preview: false,
    link: source.path,
    query: null,
    action: section.action,
  };
  if (source.status !== "available") {
    view.empty =
      source.status === "limited"
        ? "Esta consulta es demasiado amplia para mostrarla aquí."
        : "No pudimos consultar esta información. No significa que los importes sean cero.";
    view.notices = [source.note];
    return view;
  }

  switch (source.tool) {
    case "consultar_saldos_cuentas": {
      const result = accountsSchema.safeParse(source.data);
      if (!result.success) break;
      view.rows = result.data.accounts.map((account) => ({
        id: account.id,
        title: account.alias || accountTypeLabel(account.type),
        value:
          formatClp(account.balance ?? "") === "—"
            ? "—"
            : formatAccountBalance(account),
        detail: `${accountTypeLabel(account.type)} · ${formatClp(account.balance ?? "") === "—" ? "Saldo no disponible" : accountBalanceLabel(account)} · ${accountFreshnessLabel(account)}${account.trackingStatus === "paused" ? " · Seguimiento pausado: último saldo conocido" : account.trackingStatus === "disconnected" ? " · Conexión desconectada: último saldo conocido" : account.trackingStatus === "tracked" ? " · Cuenta en seguimiento" : ""}`,
      }));
      view.empty = view.rows.length
        ? null
        : "No hay cuentas activas guardadas.";
      view.notices = [
        "Saldos reportados por cuenta. Efectivo y deuda no se suman.",
      ];
      break;
    }
    case "buscar_movimientos":
    case "consultar_movimiento":
    case "consultar_movimientos_recientes": {
      const page =
        source.tool === "buscar_movimientos"
          ? TransactionsPageSchema.safeParse(source.data)
          : null;
      const detail =
        source.tool === "consultar_movimiento"
          ? TransactionDetailSchema.safeParse(source.data)
          : null;
      const result = movementsSchema.safeParse(
        page?.success
          ? { transactions: page.data.items }
          : detail?.success
            ? { transactions: [detail.data] }
            : source.data,
      );
      if (!result.success) break;
      view.rows = result.data.transactions.map((movement) => ({
        id: movement.id,
        title: movement.merchant || movement.description || "Movimiento",
        value: formatClp(movement.amount),
        detail: `${date(movement.bookedAt)} · ${movement.tag?.name || "Sin etiqueta"}${movement.reviewStatus === "needs_review" ? " · Por revisar" : ""}`,
        link: `/movimientos/${movement.id}`,
      }));
      view.empty = view.rows.length
        ? null
        : "No hay movimientos recientes guardados.";
      view.notices = [
        source.tool === "consultar_movimiento"
          ? "Clasificación consultada; una etiqueta no confirma ingresos ni identifica transferencias internas."
          : "Una vista de los movimientos seleccionados, no del historial completo.",
      ];
      if (page?.success) view.preview = page.data.pageInfo.hasMore;
      if (detail?.success) view.link = `/movimientos/${detail.data.id}`;
      break;
    }
    case "consultar_etiquetas": {
      const result = z
        .object({ tags: z.array(TagSummarySchema) })
        .safeParse(source.data);
      if (!result.success) break;
      view.rows = result.data.tags.map((tag) => ({
        id: tag.id,
        title: tag.name,
        value: "Etiqueta",
        detail: "Disponible para clasificar y planificar",
        link: "/etiquetas",
      }));
      view.empty = view.rows.length
        ? null
        : "No hay etiquetas activas guardadas.";
      break;
    }
    case "consultar_presupuestos_y_metas": {
      const result = objectivesSchema.safeParse(source.data);
      if (!result.success) break;
      view.rows = result.data.objectives.map((objective) => ({
        id: objective.id,
        title: objective.name,
        value: formatClp(objective.amount),
        detail:
          objective.intent === "saving"
            ? "Meta declarada · no es ahorro medido"
            : "Presupuesto · límite declarado",
        link:
          objective.intent === "saving"
            ? `/metas/${objective.id}`
            : `/presupuestos/${objective.id}`,
      }));
      view.empty = view.rows.length
        ? null
        : "No hay presupuestos ni metas declarados.";
      view.notices = [
        "Son objetivos declarados, no dinero reservado ni avance medido.",
      ];
      break;
    }
    case "consultar_avance_presupuestos": {
      const result = budgetsSchema.safeParse(source.data);
      if (!result.success) break;
      view.period = period(result.data.budgets[0]?.month ?? source.month);
      view.rows = result.data.budgets.map((budget) => ({
        id: budget.id,
        title: budget.name,
        value: formatClp(budget.spent),
        detail: `Gasto neto · Límite ${formatClp(budget.limit)} · Restante ${formatClp(budget.remaining)}${budget.unresolvedAdjustmentCount ? " · Ajustes por revisar" : ""}`,
        link: `/presupuestos/${budget.id}`,
        progress: Math.min(100, budget.percentage),
      }));
      view.empty = view.rows.length
        ? null
        : "No hay presupuestos aplicables a este período.";
      view.notices = [
        "Los presupuestos pueden compartir compras; sus importes no se suman ni miden ahorro.",
      ];
      break;
    }
    case "consultar_resumen_gastos_mensuales": {
      const result = spendingSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.period = monthLabel(data.month);
      view.metrics = [
        money("Gasto neto", data.spending),
        money("Compras brutas", data.grossSpending),
        money("Devoluciones", data.refunds),
        money("Reembolsos", data.reimbursements),
      ];
      view.rows = data.tags.map((tag) => ({
        id: tag.id,
        title: tag.name,
        value: formatClp(tag.amount),
        detail: `${count(tag.count, "compra", "compras")} · gasto neto`,
      }));
      view.empty = null;
      view.notices = [
        `El total incluye compras sin etiqueta${data.untaggedSpending ? `: ${formatClp(data.untaggedSpending)}` : ""}. Las recuperaciones corresponden al mes de la compra original.${data.unresolvedMovementCount ? ` ${data.unresolvedMovementCount} movimientos sin resolver no se incluyen.` : ""}`,
        `Ajustes consultados hasta ${date(data.adjustmentsAsOf)}.${data.unresolvedAdjustmentCount ? ` ${data.unresolvedAdjustmentCount} por revisar; aún no reducen el gasto.` : ""}`,
      ];
      break;
    }
    case "comparar_gastos_mensuales": {
      const result = comparisonSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.period = monthLabel(data.month);
      view.metrics = [
        money(monthLabel(data.month), data.spending.current),
        money(monthLabel(data.previousMonth), data.spending.previous),
        money("Variación del gasto", data.spending.change),
        ...(data.receivedIncome
          ? [
              money("Ingresos confirmados", data.receivedIncome.current),
              money("Variación de ingresos", data.receivedIncome.change),
            ]
          : []),
      ];
      view.empty = null;
      view.notices = [
        data.partial
          ? "Períodos parciales equivalentes: no son meses completos ni una proyección de cierre."
          : "Comparación de meses completos, según los datos guardados.",
      ];
      break;
    }
    case "consultar_ingresos": {
      const result = IncomeSummarySchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.period = monthLabel(data.month);
      view.metrics = [
        money(
          data.expectedIncome.unknownAmountCount
            ? "Plan con importe conocido"
            : "Plan del mes completo",
          data.expectedIncome.amount,
        ),
        money("Recibido confirmado", data.receivedIncome),
        money(
          "Estimaciones incluidas en el plan",
          data.expectedIncome.estimatedAmount,
        ),
      ];
      view.empty = null;
      view.notices = [
        "Esperados y recibidos no se suman ni representan dinero disponible.",
        `Recibidos hasta ${date(data.asOf)}.${data.expectedIncome.unknownAmountCount ? ` ${count(data.expectedIncome.unknownAmountCount, "pago", "pagos")} con importe por definir.` : ""}${data.unclassifiedCredits.count ? ` ${count(data.unclassifiedCredits.count, "abono sin clasificar", "abonos sin clasificar")}.` : ""}`,
      ];
      break;
    }
    case "consultar_avance_ahorro": {
      const result = SavingsProgressSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.title = data.goal.name;
      view.period = monthLabel(data.month);
      view.metrics = [
        money("Asignación neta registrada", data.netContributions),
        money("Aportes", data.contributions),
        money("Retiros", data.withdrawals),
        money("Objetivo declarado", data.goal.amount),
      ];
      view.empty = null;
      view.link = `/metas/${data.goal.id}`;
      view.action = "Ver meta de ahorro";
      view.notices = [
        `Corte ${date(data.tracking.asOf)} · No es saldo bancario ni nueva riqueza.${data.pendingCount ? ` ${count(data.pendingCount, "movimiento pendiente", "movimientos pendientes")}.` : ""}`,
        data.historyCoverage.some(
          (account) => account.completeness !== "complete",
        )
          ? "La cobertura del historial es parcial o desconocida. Las metas que comparten etiquetas no se suman."
          : "Las metas que comparten etiquetas no se suman.",
      ];
      break;
    }
    case "consultar_aportes_ahorro": {
      const result = SavingsEvidencePageSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.rows = data.items.map((movement) => ({
        id: movement.id,
        title:
          movement.merchant || movement.description || "Movimiento de ahorro",
        value: formatClp(movement.amount),
        detail: `${date(movement.bookedAt)} · ${movement.effect.status === "pending" ? "Pendiente de revisión" : movement.effect.status === "excluded" ? "No aplicado a la meta" : movement.effect.kind === "contribution" ? "Aporte registrado" : "Retiro registrado"}`,
        link: `/movimientos/${movement.id}`,
      }));
      view.empty = view.rows.length
        ? null
        : "No hay movimientos en esta página de evidencia.";
      view.preview = data.pageInfo.hasMore;
      view.notices = [
        `Evidencia consultada hasta ${date(data.tracking.asOf)}. Las páginas no se suman como un saldo.`,
      ];
      if (source.recordId) {
        view.link = `/metas/${source.recordId}`;
        view.action = "Ver aportes en la meta";
      }
      break;
    }
    case "consultar_compras_del_gasto":
    case "consultar_compras_presupuesto": {
      const result = SpendingContributionsPageSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.period = monthLabel(data.month);
      view.metrics = [
        money("Gasto neto total", data.totals.spending),
        money("Compras brutas", data.totals.grossSpending),
        money("Devoluciones", data.totals.refunds),
        money("Reembolsos", data.totals.reimbursements),
      ];
      view.rows = data.items.map((purchase) => ({
        id: purchase.id,
        title: purchase.merchant || purchase.description || "Compra",
        value: formatClp(purchase.spending),
        detail: `${date(purchase.bookedAt)} · Neto tras recuperaciones · ${purchase.tag?.name || "Sin etiqueta"}`,
        link: `/movimientos/${purchase.id}`,
      }));
      view.empty = null;
      view.preview = data.pageInfo.hasMore;
      view.notices = [
        `Los totales abarcan toda la consulta, no solo esta página. Corte de ajustes: ${date(data.tracking.adjustmentsAsOf)}.${data.totals.unresolvedAdjustmentCount ? " Hay ajustes por revisar." : ""}`,
      ];
      if (
        source.tool === "consultar_compras_presupuesto" &&
        source.recordId &&
        data.tracking.revisionId
      ) {
        view.link = `/presupuestos/${source.recordId}/movimientos`;
        view.action = "Ver compras del presupuesto";
        view.query = {
          month: data.month,
          revision: data.tracking.revisionId,
          asOf: data.tracking.asOf,
          adjustmentsAsOf: data.tracking.adjustmentsAsOf,
        };
      }
      break;
    }
    case "consultar_total_presupuestado_mes": {
      const result = MonthlyBudgetPlanSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.period = monthLabel(data.month);
      if (data.total !== null)
        view.metrics = [money("Total mensual comparable", data.total)];
      view.rows = data.budgets.map((budget) => ({
        id: budget.id,
        title: budget.name,
        value: formatClp(budget.limit),
        detail: `Límite ${budget.period === "monthly" ? "mensual" : budget.period === "yearly" ? "anual" : "de período fijo"}${budget.spent === null ? " · Gasto no observado" : ` · Gasto neto ${formatClp(budget.spent)}`}`,
        link: `/presupuestos/${budget.id}`,
      }));
      view.empty = view.rows.length
        ? null
        : "No hay presupuestos aplicables al mes.";
      view.preview = data.hasMore;
      const reasons = {
        comparable:
          "Los límites mensuales tienen la misma ventana y no comparten etiquetas. No son dinero disponible.",
        no_budgets:
          "No hay presupuestos aplicables; esto no dice cuánto puedes gastar.",
        overlapping_tags:
          "Los presupuestos comparten etiquetas: no hay un total mensual único sin duplicaciones.",
        mixed_periods:
          "Hay presupuestos mensuales, anuales o de período fijo: sus límites no se suman como un mes.",
        partial_month:
          "Uno o más presupuestos comienzan, terminan o se archivan durante el mes: sus límites no cubren un mes completo.",
        different_windows:
          "Los presupuestos cubren ventanas diferentes y no dan un total mensual comparable.",
        changed_definitions:
          "La definición de un presupuesto cambió durante el mes o la consulta; no hay un total mensual comparable confirmado.",
      };
      view.notices = [reasons[data.totalReason]];
      break;
    }
    case "consultar_aportes_mensuales_meta": {
      const result = MonthlyGoalAllocationSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.title = data.name;
      view.period = monthLabel(data.month);
      view.link = `/metas/${data.id}`;
      view.metrics = [
        money("Asignación neta del mes", data.netContributions),
        money("Aportes", data.contributions),
        money("Retiros", data.withdrawals),
      ];
      view.empty = null;
      view.notices = [
        `Solo ${monthLabel(data.month)} · No es un saldo bancario ni ahorro total.${data.pendingCount ? ` ${count(data.pendingCount, "movimiento pendiente", "movimientos pendientes")}.` : ""}`,
        ...(data.tracking.empty
          ? ["La meta no estuvo activa en el período consultado."]
          : []),
        ...(data.incompleteCoverage
          ? [
              "La cobertura del mes es parcial o desconocida; pueden faltar movimientos.",
            ]
          : []),
      ];
      break;
    }
    case "consultar_diferencia_ingresos_gastos_mes": {
      const result = MonthlyDifferenceSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.period = monthLabel(data.month);
      view.metrics = [
        money("Ingresos confirmados", data.receivedIncome),
        money("Gasto neto", data.spending),
        money("Diferencia", data.difference),
      ];
      view.empty = null;
      view.notices = [
        "Ingresos confirmados menos compras atribuidas al mes. No representa efectivo ahorrado ni variación bancaria.",
        `${count(data.unclassifiedCredits.count, "crédito sin clasificar", "créditos sin clasificar")} · ${count(data.unresolvedMovementCount, "movimiento sin resolver", "movimientos sin resolver")}.`,
      ];
      break;
    }
    case "consultar_tendencia_gastos": {
      const result = SpendingTrendSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.metrics = [money("Promedio mensual", data.average)];
      view.rows = data.months.map((row) => ({
        id: row.month,
        title: monthLabel(row.month),
        value: formatClp(row.spending),
        detail: `${row.partial ? "Mes parcial" : "Mes completo"}${row.unresolvedMovementCount ? " · Hay movimientos sin resolver" : ""}`,
      }));
      view.empty = null;
      view.notices = [
        `${data.selection === "all" ? "Todas las compras" : data.selection === "untagged" ? "Compras sin etiqueta" : "Una etiqueta seleccionada"}. Un mes con poco historial no prueba menor gasto.`,
      ];
      break;
    }
    case "consultar_variacion_gastos_por_etiqueta": {
      const result = SpendingVariationSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.period = monthLabel(data.month);
      view.metrics = [
        money("Variación neta", data.change),
        money("Gasto de este mes", data.current),
        money("Gasto anterior", data.previous),
      ];
      view.rows = data.rows.map((row) => ({
        id: row.tagId ?? "sin-etiqueta",
        title: row.name,
        value: formatClp(row.change),
        detail: `${monthLabel(data.month)} ${formatClp(row.current)} · ${monthLabel(data.previousMonth)} ${formatClp(row.previous)}`,
      }));
      view.empty = null;
      view.notices = [
        `${data.partial ? "Períodos parciales equivalentes." : "Meses completos."} Son cambios registrados, no causas demostradas.`,
        ...(data.otherChange !== "0.00"
          ? [`Otras etiquetas: ${formatClp(data.otherChange)} de variación.`]
          : []),
      ];
      break;
    }
    case "consultar_gasto_por_comercio": {
      const result = MerchantSpendingSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.period = monthLabel(data.month);
      view.metrics = [money("Gasto neto seleccionado", data.totals.spending)];
      view.rows = data.merchants.map((row, index) => ({
        id: `${index}`,
        title: row.merchant || "Comercio no indicado",
        value: formatClp(row.spending),
        detail: count(row.count, "compra", "compras"),
      }));
      view.empty = view.rows.length
        ? null
        : "No hay compras de esos comercios en el mes.";
      view.notices = [
        "Los nombres de comercios pueden variar; no se identifican suscripciones.",
        ...(data.merchantGroups > data.merchants.length
          ? [`Otros comercios: ${formatClp(data.otherSpending)} de gasto neto.`]
          : []),
      ];
      break;
    }
    case "consultar_panorama_metas_ahorro": {
      const result = SavingsGoalsOverviewSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.period = monthLabel(data.month);
      view.rows = data.goals.map((goal) => ({
        id: goal.id,
        title: goal.name,
        value: formatClp(goal.netContributions),
        detail: `Asignación neta ${goal.period === "cumulative" ? "acumulada" : goal.period === "monthly" ? "mensual" : goal.period === "yearly" ? "anual" : "de período fijo"} · Meta ${formatClp(goal.target)}${goal.incompleteCoverage ? " · Cobertura incompleta" : ""}`,
        link: `/metas/${goal.id}`,
      }));
      view.empty = view.rows.length ? null : "No hay metas actuales.";
      view.preview = data.hasMore;
      view.notices = [
        "Las metas pueden compartir movimientos; no se suman como un saldo o ahorro total.",
      ];
      break;
    }
    case "consultar_cobertura_datos_financieros": {
      const result = FinancialCoverageSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.period = monthLabel(data.month);
      view.rows = data.accounts.map((account) => ({
        id: account.id,
        title: account.alias || accountTypeLabel(account.type),
        value: account.monthCovered
          ? "Mes cubierto"
          : account.historyCompleteness === "unknown"
            ? "Cobertura desconocida"
            : "Mes sin cobertura completa",
        detail: `${accountTypeLabel(account.type)} · ${account.lastSyncedAt ? `Saldo de origen ${date(account.lastSyncedAt)}` : "Fecha de saldo desconocida"}${account.trackingStatus && account.trackingStatus !== "tracked" ? ` · Seguimiento ${account.trackingStatus === "paused" ? "pausado" : "desconectado"}` : ""}`,
      }));
      view.empty = view.rows.length
        ? null
        : "No hay cuentas activas guardadas.";
      view.notices = [
        `${count(data.unresolvedMovementCount, "movimiento sin resolver", "movimientos sin resolver")} y ${count(data.unclassifiedCreditCount, "crédito sin clasificar", "créditos sin clasificar")} en el mes. La hora de consulta no es la fecha de sincronización.`,
      ];
      break;
    }
    case "consultar_gastos_rango_fechas": {
      const result = SpendingRangeSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.metrics = [
        money("Gasto neto", data.spending),
        money("Compras brutas", data.grossSpending),
        money("Devoluciones", data.refunds),
        money("Reembolsos", data.reimbursements),
      ];
      view.empty = null;
      view.notices = [
        `Del ${data.from} al día anterior al ${data.before} en Santiago.${data.partial ? " Hoy está incluido parcialmente." : ""} Esto no es necesariamente un mes calendario.`,
      ];
      break;
    }
    case "consultar_cargos_recurrentes_observados": {
      const result = RecurringCandidatesSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.rows = data.candidates.map((row) => ({
        id: row.merchant,
        title: row.merchant,
        value: formatClp(row.total),
        detail: `${row.observedMonths} meses con compras · Último mes ${monthLabel(row.lastObservedMonth)} · Suma observada en el rango`,
      }));
      view.empty = view.rows.length
        ? null
        : "No se encontraron patrones repetidos con suficiente historial; esto no descarta cargos reales.";
      view.preview = data.hasMore;
      view.notices = [
        "Son posibles patrones, no suscripciones verificadas, facturas ni próximos cobros.",
      ];
      break;
    }
  }

  view.preview ||= view.rows.length > (expanded ? 100 : 4);
  view.rows = view.rows.slice(0, expanded ? 100 : 4);
  return view;
}
