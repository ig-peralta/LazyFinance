import {
  AccountSummarySchema,
  type AssistantReadName,
  type AssistantSource,
  BudgetProgressSchema,
  IncomeSummarySchema,
  MonthlyComparisonSchema,
  MonthlySummarySchema,
  MonthSchema,
  ObjectiveSummarySchema,
  RecentTransactionSchema,
  SavingsEvidencePageSchema,
  SavingsProgressSchema,
  SpendingContributionsPageSchema,
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
  list_tags: {
    name: "Etiquetas",
    icon: "tag",
    action: "Ver etiquetas",
  },
  search_transactions: {
    name: "Movimientos",
    icon: "activity",
    action: "Ver movimientos",
  },
  get_transaction_details: {
    name: "Movimientos",
    icon: "activity",
    action: "Ver movimiento",
  },
  get_account_balances: {
    name: "Cuentas",
    icon: "wallet",
    action: "Ver cuentas",
  },
  get_recent_transactions: {
    name: "Movimientos",
    icon: "activity",
    action: "Ver movimientos",
  },
  get_budgets_and_goals: {
    name: "Planificación",
    icon: "target",
    action: "Ver planificación",
  },
  get_budget_progress: {
    name: "Presupuestos",
    icon: "target",
    action: "Ver presupuestos",
  },
  get_monthly_spending_summary: {
    name: "Gastos",
    icon: "activity",
    action: "Ver movimientos",
  },
  compare_monthly_spending: {
    name: "Gastos",
    icon: "trend",
    action: "Ver movimientos",
  },
  get_income_summary: {
    name: "Ingresos",
    icon: "income",
    action: "Ver ingresos",
  },
  get_savings_progress: {
    name: "Ahorro",
    icon: "target",
    action: "Ver metas de ahorro",
  },
  get_savings_contributions: {
    name: "Ahorro",
    icon: "target",
    action: "Ver metas de ahorro",
  },
  get_spending_evidence: {
    name: "Compras",
    icon: "activity",
    action: "Ver movimientos",
  },
  get_budget_spending_evidence: {
    name: "Presupuestos",
    icon: "target",
    action: "Ver presupuestos",
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
});
const comparisonSchema = MonthlyComparisonSchema.pick({
  month: true,
  previousMonth: true,
  partial: true,
  spending: true,
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
    case "get_account_balances": {
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
    case "search_transactions":
    case "get_transaction_details":
    case "get_recent_transactions": {
      const page =
        source.tool === "search_transactions"
          ? TransactionsPageSchema.safeParse(source.data)
          : null;
      const detail =
        source.tool === "get_transaction_details"
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
        source.tool === "get_transaction_details"
          ? "Clasificación consultada; una etiqueta no confirma ingresos ni identifica transferencias internas."
          : "Una vista de los movimientos seleccionados, no del historial completo.",
      ];
      if (page?.success) view.preview = page.data.pageInfo.hasMore;
      if (detail?.success) view.link = `/movimientos/${detail.data.id}`;
      break;
    }
    case "list_tags": {
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
    case "get_budgets_and_goals": {
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
    case "get_budget_progress": {
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
    case "get_monthly_spending_summary": {
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
        "El total incluye compras sin etiqueta. Las recuperaciones corresponden al mes de la compra original.",
        `Ajustes consultados hasta ${date(data.adjustmentsAsOf)}.${data.unresolvedAdjustmentCount ? ` ${data.unresolvedAdjustmentCount} por revisar; aún no reducen el gasto.` : ""}`,
      ];
      break;
    }
    case "compare_monthly_spending": {
      const result = comparisonSchema.safeParse(source.data);
      if (!result.success) break;
      const data = result.data;
      view.period = monthLabel(data.month);
      view.metrics = [
        money(monthLabel(data.month), data.spending.current),
        money(monthLabel(data.previousMonth), data.spending.previous),
        money("Variación del gasto", data.spending.change),
      ];
      view.empty = null;
      view.notices = [
        data.partial
          ? "Períodos parciales equivalentes: no son meses completos ni una proyección de cierre."
          : "Comparación de meses completos, según los datos guardados.",
      ];
      break;
    }
    case "get_income_summary": {
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
    case "get_savings_progress": {
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
    case "get_savings_contributions": {
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
    case "get_spending_evidence":
    case "get_budget_spending_evidence": {
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
        source.tool === "get_budget_spending_evidence" &&
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
  }

  view.preview ||= view.rows.length > (expanded ? 100 : 4);
  view.rows = view.rows.slice(0, expanded ? 100 : 4);
  return view;
}
