import {
  MonthlyComparisonReadSchema,
  MonthlySpendingReadSchema,
} from "@lazyfinance/contracts";
import { Ctx, Payload } from "@nestjs/microservices";
import { McpContext, McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import {
  mcpMonth,
  mcpUserId,
  monthParameters,
  readOnlyTool,
} from "../mcp/mcp.tools";
import { SummariesService } from "./summaries.service";

@McpController()
export class SummariesMcpController {
  constructor(private readonly summaries: SummariesService) {}

  @Tool({
    name: "consultar_resumen_gastos_mensuales",
    description:
      "Gasto neto del mes calendario, compras brutas, devoluciones y reembolsos. Para 'mes pasado' indica el YYYY-MM anterior. La recuperación corresponde al mes de la compra; no es ingreso. El total incluye sin etiqueta y untaggedSpending lo muestra. Los ajustes por revisar no reducen el gasto.",
    parameters: monthParameters,
    annotations: {
      title: "Consultar gastos por mes y etiqueta",
      ...readOnlyTool,
    },
    outputSchema: MonthlySpendingReadSchema,
  })
  async getMonthly(
    @Payload() { month }: z.infer<typeof monthParameters>,
    @Ctx() ctx: McpContext,
  ) {
    const summary = await this.summaries.getSpendingForUser(
      mcpUserId(ctx),
      mcpMonth(month),
    );
    return {
      month: summary.month,
      spending: summary.spending,
      tags: summary.tags,
      grossSpending: summary.grossSpending,
      refunds: summary.refunds,
      reimbursements: summary.reimbursements,
      unresolvedAdjustmentCount: summary.unresolvedAdjustmentCount,
      recoveredExpenseCredits: summary.recoveredExpenseCredits,
      adjustmentsAsOf: summary.adjustmentsAsOf,
      asOf: summary.asOf,
      untaggedSpending: summary.untaggedSpending,
      unresolvedMovementCount: summary.unresolvedMovementCount,
    };
  }

  @Tool({
    name: "comparar_gastos_mensuales",
    description:
      "Compara gasto neto e ingresos confirmados del mes con el anterior. Las recuperaciones siguen la compra original. Para el mes actual usa fechas comparables, no proyección al cierre.",
    parameters: monthParameters,
    annotations: {
      title: "Comparar gastos con el mes anterior",
      ...readOnlyTool,
    },
    outputSchema: MonthlyComparisonReadSchema,
  })
  async getComparison(
    @Payload() { month }: z.infer<typeof monthParameters>,
    @Ctx() ctx: McpContext,
  ) {
    const {
      month: period,
      previousMonth,
      partial,
      spending,
      receivedIncome,
      unresolvedMovementCount,
    } = await this.summaries.getComparisonForUser(
      mcpUserId(ctx),
      mcpMonth(month),
    );
    return {
      month: period,
      previousMonth,
      partial,
      spending,
      receivedIncome,
      unresolvedMovementCount,
    };
  }
}
