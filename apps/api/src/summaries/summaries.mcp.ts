import {
  MonthlyComparisonSchema,
  MonthlySummarySchema,
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
      "Resume compras brutas, devoluciones, reembolsos y gasto neto del mes en CLP. Los ajustes confirmados se atribuyen al período y etiqueta de la compra original, aunque el abono llegue después; los abonos recibidos se muestran aparte y no son ingresos. Usa America/Santiago y excluye movimientos internos. Cada compra tiene como máximo una etiqueta; el total incluye compras sin etiqueta. Los ajustes por revisar no reducen el gasto.",
    parameters: monthParameters,
    annotations: {
      title: "Consultar gastos por mes y etiqueta",
      ...readOnlyTool,
    },
    outputSchema: MonthlySummarySchema.pick({
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
  })
  async getMonthly(
    @Payload() { month }: z.infer<typeof monthParameters>,
    @Ctx() ctx: McpContext,
  ) {
    const summary = await this.summaries.getMonthlyForUser(
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
    };
  }

  @Tool({
    name: "comparar_gastos_mensuales",
    description:
      "Compara el gasto neto de compras de un mes con el anterior en CLP. Devoluciones y reembolsos confirmados se atribuyen al período de la compra original con la información disponible ahora, no a la fecha del abono. Para el mes actual usa fechas comparables; los meses pasados se comparan completos. No proyecta el fin de mes.",
    parameters: monthParameters,
    annotations: {
      title: "Comparar gastos con el mes anterior",
      ...readOnlyTool,
    },
    outputSchema: MonthlyComparisonSchema.pick({
      month: true,
      previousMonth: true,
      partial: true,
      spending: true,
    }),
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
    } = await this.summaries.getComparisonForUser(
      mcpUserId(ctx),
      mcpMonth(month),
    );
    return { month: period, previousMonth, partial, spending };
  }
}
