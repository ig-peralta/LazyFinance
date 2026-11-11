import {
  AccountListItemSchema,
  type AssistantReadName,
  type AssistantSource,
  BudgetContributionsInputSchema,
  BudgetProgressSchema,
  IncomeSummarySchema,
  MonthlyComparisonSchema,
  MonthlySummarySchema,
  MonthSchema,
  ObjectiveSummarySchema,
  RecentTransactionSchema,
  SavingsEvidenceInputSchema,
  SavingsEvidencePageSchema,
  SavingsProgressInputSchema,
  SavingsProgressSchema,
  SpendingContributionsInputSchema,
  SpendingContributionsPageSchema,
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
      "Compras brutas, devoluciones, reembolsos y gasto neto por período/etiqueta de la compra original. Total incluye sin etiqueta. Recuperaciones no son ingresos; ajustes por revisar no reducen gasto.",
      monthInput,
      MonthlySummarySchema.pick({
        month: true,
        spending: true,
        tags: true,
        grossSpending: true,
        refunds: true,
        reimbursements: true,
        unresolvedAdjustmentCount: true,
        recoveredExpenseCredits: true,
        adjustmentsAsOf: true,
      }),
      "/movimientos",
      async (userId, input) =>
        this.summaries.getMonthlyForUser(userId, month(input.month)),
    ),
    comparar_gastos_mensuales: read(
      "Comparación de gastos",
      "Compara el mes solicitado con el anterior. partial=true compara períodos parciales equivalentes; no es proyección al cierre. Recuperaciones siguen la compra original.",
      monthInput,
      MonthlyComparisonSchema.pick({
        month: true,
        previousMonth: true,
        partial: true,
        spending: true,
      }),
      "/movimientos",
      async (userId, input) =>
        this.summaries.getComparisonForUser(userId, month(input.month)),
    ),
    consultar_ingresos: read(
      "Ingresos esperados y recibidos",
      "Esperados cubren el mes completo; recibidos son créditos confirmados hasta asOf. Se permiten expectativas futuras. No sumes esperados+recibidos ni los presentes como dinero disponible. Distingue estimaciones, desconocidos y recuperaciones.",
      monthInput,
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
  } satisfies Record<AssistantReadName, unknown>;
}
