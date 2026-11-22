import {
  AccountListItemSchema,
  type AssistantReadName,
  type AssistantSource,
  BudgetContributionsInputSchema,
  BudgetProgressSchema,
  FinancialCoverageSchema,
  IncomeSummarySchema,
  MerchantSpendingInputSchema,
  MerchantSpendingSchema,
  MonthlyBudgetPlanSchema,
  MonthlyComparisonReadSchema,
  MonthlyDifferenceSchema,
  MonthlyGoalAllocationSchema,
  MonthlySpendingReadSchema,
  MonthSchema,
  ObjectiveSummarySchema,
  RecentTransactionSchema,
  RecurringCandidatesInputSchema,
  RecurringCandidatesSchema,
  SavingsEvidenceInputSchema,
  SavingsEvidencePageSchema,
  SavingsGoalsOverviewSchema,
  SavingsProgressInputSchema,
  SavingsProgressSchema,
  SpendingContributionsInputSchema,
  SpendingContributionsPageSchema,
  SpendingRangeInputSchema,
  SpendingRangeSchema,
  SpendingTrendInputSchema,
  SpendingTrendSchema,
  SpendingVariationSchema,
  TagSummarySchema,
  TransactionDetailSchema,
  TransactionsInputSchema,
  TransactionsPageSchema,
} from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { AccountsService } from "../accounts/accounts.service";
import { SpendingEvidenceService } from "../finance/spending-evidence.service";
import { IncomeService } from "../income/income.service";
import { ObjectivesService } from "../objectives/objectives.service";
import { SavingsProgressService } from "../objectives/savings-progress.service";
import { SpendingInsightsService } from "../summaries/spending-insights.service";
import { SummariesService } from "../summaries/summaries.service";
import { TaggingService } from "../transactions/tagging/tagging.service";
import { TransactionsService } from "../transactions/transactions.service";
import { checkedMonth } from "../utils/month-query";
import { santiagoMonth } from "../utils/santiago-time";

const empty = z.strictObject({});
const monthInput = z.strictObject({
  month: MonthSchema.optional().describe(
    "Mes YYYY-MM en America/Santiago; omitir usa el actual. Gastos no admiten meses futuros.",
  ),
});
const planMonthInput = z.strictObject({
  month: MonthSchema.optional().describe(
    "Mes YYYY-MM en America/Santiago; omitir usa el actual. Un mes futuro muestra el plan sin gasto observado.",
  ),
});
const incomeMonthInput = z.strictObject({
  month: MonthSchema.optional().describe(
    "Mes YYYY-MM en America/Santiago; omitir usa el actual. Las expectativas pueden ser futuras, pero los ingresos recibidos solo se confirman hasta asOf.",
  ),
});
const month = (value?: string) =>
  checkedMonth(value ?? santiagoMonth(new Date()));

function read<I extends z.ZodType, O extends z.ZodType>(
  title: string,
  description: string,
  inputSchema: I,
  outputSchema: O,
  path: AssistantSource["path"],
  execute: (userId: string, input: z.output<I>) => Promise<z.input<O>>,
) {
  return {
    title,
    description,
    inputSchema,
    path,
    execute: async (userId: string, input: unknown) => {
      const output = outputSchema.parse(
        await execute(userId, inputSchema.parse(input)),
      );
      return z.json().parse(JSON.parse(JSON.stringify(output)));
    },
  };
}

/** Same financial/supporting reads as MCP; the trusted caller is never a tool argument. */
@Injectable()
export class FinancialReads {
  constructor(
    private readonly accounts: AccountsService,
    private readonly transactions: TransactionsService,
    private readonly summaries: SummariesService,
    private readonly insights: SpendingInsightsService,
    private readonly objectives: ObjectivesService,
    private readonly savings: SavingsProgressService,
    private readonly income: IncomeService,
    private readonly evidence: SpendingEvidenceService,
    private readonly tagging: TaggingService,
  ) {}

  readonly tools = {
    consultar_etiquetas: read(
      "Etiquetas disponibles",
      "Catálogo de etiquetas propias activas. Usa IDs reales al preparar presupuestos, metas o decisiones; no inventes IDs ni confundas sin etiqueta con una decisión pendiente.",
      empty,
      z.object({ tags: z.array(TagSummarySchema).max(10000) }),
      "/etiquetas",
      async (userId) => ({ tags: await this.tagging.listTagsForUser(userId) }),
    ),
    buscar_movimientos: read(
      "Movimientos seleccionados",
      "Busca movimientos propios por cuenta, fechas, comercio, dirección y etiqueta. tagId:null incluye decisiones deliberadas sin etiqueta: revisa tagDecisionOrigin antes de proponer cambios. Una página no es el historial completo ni un total.",
      TransactionsInputSchema,
      TransactionsPageSchema,
      "/movimientos",
      (userId, input) => this.transactions.listForUser(userId, input),
    ),
    consultar_movimiento: read(
      "Detalle del movimiento",
      "Hechos actuales de un movimiento propio, incluida su decisión de etiqueta y estado. Consulta antes de proponer una nueva decisión. Etiquetar no confirma ingresos ni identifica transferencias internas.",
      z.strictObject({ id: z.uuid() }),
      TransactionDetailSchema,
      "/movimientos",
      (userId, input) => this.transactions.detailForUser(userId, input.id),
    ),
    consultar_saldos_cuentas: read(
      "Cuentas y saldos",
      "Saldos reportados, tipo de cuenta, fecha de origen y seguimiento activo/en pausa/sin acceso. Los saldos en pausa son últimos valores conocidos, no datos actuales. null es desconocido; tarjetas son deuda. No reconstruyas saldos ni uses ingresos esperados como efectivo.",
      empty,
      z.object({ accounts: z.array(AccountListItemSchema) }),
      "/cuentas",
      async (userId) => ({
        accounts: await this.accounts.getActiveForUser(userId),
      }),
    ),
    consultar_movimientos_recientes: read(
      "Movimientos recientes",
      "Hasta diez movimientos propios; no es un historial completo ni detección de anomalías. Conserva fechas, etiquetas y estados de revisión.",
      empty,
      z.object({ transactions: z.array(RecentTransactionSchema) }),
      "/movimientos",
      async (userId) => ({
        transactions: await this.transactions.getRecentForUser(userId),
      }),
    ),
    consultar_presupuestos_y_metas: read(
      "Presupuestos y metas",
      "Objetivos declarados, límites y etiquetas; NO es avance medido de ahorro. Usa sus IDs para consultar avance/evidencia.",
      empty,
      z.object({ objectives: z.array(ObjectiveSummarySchema) }),
      "/presupuestos-y-metas",
      async (userId) => ({
        objectives: await this.objectives.getForUser(userId),
      }),
    ),
    consultar_avance_presupuestos: read(
      "Avance de presupuestos",
      "Gasto neto, bruto, recuperaciones y restante del período de cada presupuesto. Presupuestos superpuestos no se suman. No mide ahorro.",
      monthInput,
      z.object({ budgets: z.array(BudgetProgressSchema) }),
      "/presupuestos-y-metas",
      async (userId, input) => ({
        budgets: await this.objectives.getSpendingProgressForUser(
          userId,
          month(input.month),
        ),
      }),
    ),
    consultar_resumen_gastos_mensuales: read(
      "Gastos del mes",
      "Para 'cuánto gasté el mes pasado' indica el mes anterior explícitamente. Gasto neto del mes calendario, compras brutas y recuperaciones de la compra original. Total incluye sin etiqueta; untaggedSpending lo cuantifica. No es saldo ni ahorro. asOf es el corte de movimientos y adjustmentsAsOf el de recuperaciones.",
      monthInput,
      MonthlySpendingReadSchema,
      "/movimientos",
      async (userId, input) =>
        this.summaries.getSpendingForUser(userId, month(input.month)),
    ),
    comparar_gastos_mensuales: read(
      "Comparación de gastos",
      "Compara gasto neto e ingresos confirmados con el mes anterior. partial=true compara períodos parciales equivalentes; no es proyección al cierre. Recuperaciones siguen la compra original.",
      monthInput,
      MonthlyComparisonReadSchema,
      "/movimientos",
      async (userId, input) =>
        this.summaries.getComparisonForUser(userId, month(input.month)),
    ),
    consultar_ingresos: read(
      "Ingresos esperados y recibidos",
      "Esperados cubren el mes completo; recibidos son créditos confirmados hasta asOf. Se permiten expectativas futuras. No sumes esperados+recibidos ni los presentes como dinero disponible. Distingue estimaciones, desconocidos y recuperaciones.",
      incomeMonthInput,
      IncomeSummarySchema,
      "/ingresos",
      async (userId, input) =>
        this.income.getSummaryForUser(userId, input.month),
    ),
    consultar_avance_ahorro: read(
      "Avance de ahorro",
      "Aportes, retiros y asignación neta medidos para una meta propia. No es saldo, ingresos ni nueva riqueza. Cobertura incompleta y metas superpuestas deben explicarse.",
      SavingsProgressInputSchema,
      SavingsProgressSchema,
      "/metas",
      async (userId, input) => this.savings.progress(userId, input),
    ),
    consultar_aportes_ahorro: read(
      "Evidencia del ahorro",
      "Movimientos que explican la meta. Conserva id, mes y tracking.asOf al paginar. No sumes páginas como saldos ni ocultes pendientes/cobertura.",
      SavingsEvidenceInputSchema,
      SavingsEvidencePageSchema,
      "/metas",
      async (userId, input) => this.savings.evidence(userId, input),
    ),
    consultar_compras_del_gasto: read(
      "Compras que explican el gasto",
      "Evidencia paginada del gasto propio; totales completos no se calculan sumando páginas. Conserva filtros, asOf y adjustmentsAsOf. tagId null selecciona sin etiqueta.",
      SpendingContributionsInputSchema,
      SpendingContributionsPageSchema,
      "/movimientos",
      async (userId, input) => this.evidence.summary(userId, input),
    ),
    consultar_compras_presupuesto: read(
      "Compras del presupuesto",
      "Evidencia del presupuesto propio. Usa id, revisionId, mes y adjustmentsAsOf del avance. Conserva cortes al paginar; recuperaciones se atribuyen a la compra.",
      BudgetContributionsInputSchema,
      SpendingContributionsPageSchema,
      "/presupuestos-y-metas",
      async (userId, input) => this.evidence.budget(userId, input),
    ),
    consultar_total_presupuestado_mes: read(
      "Presupuestos del mes y total compatible",
      "Límites declarados aplicables al mes y avance por presupuesto. total solo existe si todos son mensuales, tienen la misma ventana y etiquetas disjuntas; nunca sumes límites anuales/fijos, presupuestos solapados ni gastos duplicados. Permite mes futuro para plan sin gasto observado.",
      planMonthInput,
      MonthlyBudgetPlanSchema,
      "/presupuestos-y-metas",
      (userId, input) =>
        this.objectives.monthlyPlan(
          userId,
          input.month ?? santiagoMonth(new Date()),
        ),
    ),
    consultar_aportes_mensuales_meta: read(
      "Aportes de una meta en un mes",
      "Para una meta propia, aportes, retiros y neto SOLO dentro del mes seleccionado, aun si su avance normal es anual, fijo o acumulado. No es saldo, riqueza ni ahorro total. No sumes metas superpuestas; muestra corte, pendientes y cobertura.",
      SavingsProgressInputSchema,
      MonthlyGoalAllocationSchema,
      "/metas",
      (userId, input) => this.savings.monthly(userId, input),
    ),
    consultar_diferencia_ingresos_gastos_mes: read(
      "Diferencia entre ingresos y gastos",
      "Ingreso recibido confirmado menos gasto neto atribuido al mes, con un corte común. NO representa efectivo ahorrado, variación bancaria ni flujo de caja puro; compras con tarjeta y recuperaciones de compras anteriores afectan períodos diferentes. Créditos sin clasificar no son ingresos.",
      monthInput,
      MonthlyDifferenceSchema,
      "/movimientos",
      (userId, input) => this.insights.difference(userId, month(input.month)),
    ),
    consultar_tendencia_gastos: read(
      "Tendencia mensual de gastos",
      "Dos a doce meses consecutivos; promedio y gasto mensual de todas las compras, de una etiqueta real o de compras sin etiqueta (tagId:null). El mes actual es parcial; historial incompleto no implica menor gasto. No adivines categorías por el nombre.",
      SpendingTrendInputSchema,
      SpendingTrendSchema,
      "/movimientos",
      (userId, input) => this.insights.trend(userId, input),
    ),
    consultar_variacion_gastos_por_etiqueta: read(
      "Variación del gasto por etiqueta",
      "Compara etiquetas y compras sin etiqueta con el mes anterior; muestra las diferencias registradas, no causas personales. partial compara intervalos parciales equivalentes. otherChange conserva el cambio fuera de las principales etiquetas.",
      monthInput,
      SpendingVariationSchema,
      "/movimientos",
      (userId, input) => this.insights.variation(userId, month(input.month)),
    ),
    consultar_gasto_por_comercio: read(
      "Gasto por comercio",
      "Agregado completo por comercio del mes (no páginas de movimientos); merchant filtra literalmente sin distinguir mayúsculas. Diferentes nombres del mismo comercio siguen separados; sin comercio conocido es un grupo sin nombre. No identifica categorías ni suscripciones.",
      MerchantSpendingInputSchema,
      MerchantSpendingSchema,
      "/movimientos",
      (userId, input) => this.insights.merchant(userId, input),
    ),
    consultar_panorama_metas_ahorro: read(
      "Panorama de metas",
      "Avance medido individual de hasta doce metas actuales; hasMore indica que faltan metas. No sumes sus aportes, saldos ni porcentajes: las etiquetas pueden solaparse. No es dinero disponible.",
      monthInput,
      SavingsGoalsOverviewSchema,
      "/metas",
      (userId, input) => this.savings.overview(userId, month(input.month)),
    ),
    consultar_cobertura_datos_financieros: read(
      "Cobertura de los datos",
      "Fuente de saldo y cobertura por cuenta, movimientos por revisar y créditos sin clasificar del mes. La hora de consulta no prueba actualización bancaria; cobertura parcial o desconocida no equivale a cero.",
      monthInput,
      FinancialCoverageSchema,
      "/cuentas",
      (userId, input) =>
        this.accounts.coverageForUser(userId, month(input.month)),
    ),
    consultar_gastos_rango_fechas: read(
      "Gastos por rango de días",
      "Gasto neto total en días calendario de Santiago [from,before), máximo 366 días. 'Mes pasado' es mes calendario; 'últimos 30 días' es otro rango. No sumes páginas de movimientos ni incluyas períodos futuros.",
      SpendingRangeInputSchema,
      SpendingRangeSchema,
      "/movimientos",
      (userId, input) => this.insights.range(userId, input),
    ),
    consultar_cargos_recurrentes_observados: read(
      "Posibles cargos repetidos",
      "Candidatos observados con al menos tres meses consecutivos de un cargo por comercio y montos similares, en 3–12 meses. NO certifica suscripción activa, factura, próximo cobro ni fecha de vencimiento. Un comercio puede cambiar de nombre y faltar historia.",
      RecurringCandidatesInputSchema,
      RecurringCandidatesSchema,
      "/movimientos",
      (userId, input) => this.insights.recurring(userId, input),
    ),
  } satisfies Record<AssistantReadName, unknown>;
}
