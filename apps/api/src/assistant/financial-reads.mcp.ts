import {
  FinancialCoverageSchema,
  MerchantSpendingInputSchema,
  MerchantSpendingSchema,
  MonthlyBudgetPlanSchema,
  MonthlyDifferenceSchema,
  MonthlyGoalAllocationSchema,
  MonthSchema,
  RecurringCandidatesInputSchema,
  RecurringCandidatesSchema,
  SavingsGoalsOverviewSchema,
  SavingsProgressInputSchema,
  SpendingRangeInputSchema,
  SpendingRangeSchema,
  SpendingTrendInputSchema,
  SpendingTrendSchema,
  SpendingVariationSchema,
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
import { santiagoMonth } from "../utils/santiago-time";
import { FinancialReads } from "./financial-reads";

const planMonthParameters = z.object({
  month: MonthSchema.optional().describe(
    "Mes YYYY-MM en Santiago; un mes futuro solo tiene plan, sin gasto observado.",
  ),
});

@McpController()
export class FinancialReadsMcpController {
  constructor(private readonly reads: FinancialReads) {}

  @Tool({
    name: "consultar_total_presupuestado_mes",
    description:
      "Límites de presupuestos por período. Solo devuelve total cuando todos son mensuales, tienen la misma ventana y etiquetas disjuntas; no confundas presupuesto con efectivo o ahorro. Un mes futuro contiene planes, sin gasto observado.",
    parameters: planMonthParameters,
    outputSchema: MonthlyBudgetPlanSchema,
    annotations: { title: "Presupuestos y total compatible", ...readOnlyTool },
  })
  budgetPlan(
    @Payload() { month }: z.infer<typeof planMonthParameters>,
    @Ctx() ctx: McpContext,
  ) {
    return this.reads.tools.consultar_total_presupuestado_mes.execute(
      mcpUserId(ctx),
      { month: month ?? santiagoMonth(new Date()) },
    );
  }

  @Tool({
    name: "consultar_aportes_mensuales_meta",
    description:
      "Aportes, retiros y asignación neta de UNA meta en el mes calendario seleccionado, incluso si su avance general es acumulado/anual/fijo. No es ahorro total ni saldo y metas superpuestas no se suman.",
    parameters: SavingsProgressInputSchema,
    outputSchema: MonthlyGoalAllocationSchema,
    annotations: { title: "Aportes de una meta en el mes", ...readOnlyTool },
  })
  goalMonth(
    @Payload() input: z.infer<typeof SavingsProgressInputSchema>,
    @Ctx() ctx: McpContext,
  ) {
    return this.reads.tools.consultar_aportes_mensuales_meta.execute(
      mcpUserId(ctx),
      input,
    );
  }

  @Tool({
    name: "consultar_diferencia_ingresos_gastos_mes",
    description:
      "Ingresos confirmados menos gasto neto atribuido a compras del mes; no es efectivo ahorrado ni variación bancaria. Créditos sin clasificar no son ingresos.",
    parameters: monthParameters,
    outputSchema: MonthlyDifferenceSchema,
    annotations: {
      title: "Diferencia entre ingresos y gastos",
      ...readOnlyTool,
    },
  })
  monthlyDifference(
    @Payload() { month }: z.infer<typeof monthParameters>,
    @Ctx() ctx: McpContext,
  ) {
    return this.reads.tools.consultar_diferencia_ingresos_gastos_mes.execute(
      mcpUserId(ctx),
      { month: mcpMonth(month) },
    );
  }

  @Tool({
    name: "consultar_tendencia_gastos",
    description:
      "Gasto neto por mes y promedio de dos a doce meses, opcionalmente por etiqueta o sin etiqueta. El mes actual es parcial y puede faltar historial.",
    parameters: SpendingTrendInputSchema,
    outputSchema: SpendingTrendSchema,
    annotations: { title: "Tendencia de gastos", ...readOnlyTool },
  })
  trend(
    @Payload() input: z.infer<typeof SpendingTrendInputSchema>,
    @Ctx() ctx: McpContext,
  ) {
    return this.reads.tools.consultar_tendencia_gastos.execute(
      mcpUserId(ctx),
      input,
    );
  }

  @Tool({
    name: "consultar_variacion_gastos_por_etiqueta",
    description:
      "Diferencias de gasto por etiqueta y sin etiqueta contra el mes anterior. Los cambios registrados no demuestran una causa personal; partial indica comparación de períodos parciales.",
    parameters: monthParameters,
    outputSchema: SpendingVariationSchema,
    annotations: { title: "Cambio del gasto por etiqueta", ...readOnlyTool },
  })
  variation(
    @Payload() { month }: z.infer<typeof monthParameters>,
    @Ctx() ctx: McpContext,
  ) {
    return this.reads.tools.consultar_variacion_gastos_por_etiqueta.execute(
      mcpUserId(ctx),
      { month: mcpMonth(month) },
    );
  }

  @Tool({
    name: "consultar_gasto_por_comercio",
    description:
      "Gasto del mes agregado por comercio; merchant filtra literalmente sin distinguir mayúsculas. Nombres distintos son grupos distintos y no prueban una suscripción.",
    parameters: MerchantSpendingInputSchema,
    outputSchema: MerchantSpendingSchema,
    annotations: { title: "Gastos por comercio", ...readOnlyTool },
  })
  merchant(
    @Payload() input: z.infer<typeof MerchantSpendingInputSchema>,
    @Ctx() ctx: McpContext,
  ) {
    return this.reads.tools.consultar_gasto_por_comercio.execute(
      mcpUserId(ctx),
      input,
    );
  }

  @Tool({
    name: "consultar_panorama_metas_ahorro",
    description:
      "Avance individual de hasta doce metas, sin sumarlas: pueden compartir movimientos. hasMore indica metas no incluidas.",
    parameters: monthParameters,
    outputSchema: SavingsGoalsOverviewSchema,
    annotations: { title: "Panorama de metas", ...readOnlyTool },
  })
  goals(
    @Payload() { month }: z.infer<typeof monthParameters>,
    @Ctx() ctx: McpContext,
  ) {
    return this.reads.tools.consultar_panorama_metas_ahorro.execute(
      mcpUserId(ctx),
      { month: mcpMonth(month) },
    );
  }

  @Tool({
    name: "consultar_cobertura_datos_financieros",
    description:
      "Cortes bancarios y cobertura de historial por cuenta; movimientos por revisar y créditos sin clasificar del mes. Hora de consulta no significa sincronización.",
    parameters: monthParameters,
    outputSchema: FinancialCoverageSchema,
    annotations: { title: "Cobertura y calidad de datos", ...readOnlyTool },
  })
  coverage(
    @Payload() { month }: z.infer<typeof monthParameters>,
    @Ctx() ctx: McpContext,
  ) {
    return this.reads.tools.consultar_cobertura_datos_financieros.execute(
      mcpUserId(ctx),
      { month: mcpMonth(month) },
    );
  }

  @Tool({
    name: "consultar_gastos_rango_fechas",
    description:
      "Gasto neto entre dos fechas calendario de Santiago [from,before), máximo 366 días, distinto del mes calendario.",
    parameters: SpendingRangeInputSchema,
    outputSchema: SpendingRangeSchema,
    annotations: { title: "Gasto por rango de días", ...readOnlyTool },
  })
  range(
    @Payload() input: z.infer<typeof SpendingRangeInputSchema>,
    @Ctx() ctx: McpContext,
  ) {
    return this.reads.tools.consultar_gastos_rango_fechas.execute(
      mcpUserId(ctx),
      input,
    );
  }

  @Tool({
    name: "consultar_cargos_recurrentes_observados",
    description:
      "Candidatos de comercios con cargos mensuales parecidos en tres meses consecutivos. NO confirma contratos, suscripciones activas, próximos cobros ni vencimientos.",
    parameters: RecurringCandidatesInputSchema,
    outputSchema: RecurringCandidatesSchema,
    annotations: { title: "Posibles cargos repetidos", ...readOnlyTool },
  })
  recurring(
    @Payload() input: z.infer<typeof RecurringCandidatesInputSchema>,
    @Ctx() ctx: McpContext,
  ) {
    return this.reads.tools.consultar_cargos_recurrentes_observados.execute(
      mcpUserId(ctx),
      input,
    );
  }
}
