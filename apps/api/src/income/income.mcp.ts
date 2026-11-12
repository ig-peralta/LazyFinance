import { IncomeSummarySchema, MonthSchema } from "@lazyfinance/contracts";
import { Ctx, Payload } from "@nestjs/microservices";
import { McpContext, McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { mcpUserId, readOnlyTool } from "../mcp/mcp.tools";
import { IncomeService } from "./income.service";

@McpController()
export class IncomeMcpController {
  constructor(private readonly income: IncomeService) {}

  @Tool({
    name: "get_income_summary",
    description:
      "Consulta ingresos esperados del mes completo e ingresos recibidos confirmados hasta asOf, en CLP. Distingue créditos sin clasificar y abonos por devoluciones o reembolsos de gastos: estos abonos no son ingresos. Incluye fechas de pago, estimaciones e importes desconocidos. Lo esperado no es dinero disponible ni se suma a lo recibido. Permite meses futuros para expectativas sin inventar ingresos recibidos.",
    parameters: z.object({
      month: MonthSchema.optional().describe(
        "Mes YYYY-MM en America/Santiago; por defecto el actual. Se permiten meses futuros para expectativas.",
      ),
    }),
    outputSchema: IncomeSummarySchema,
    annotations: {
      title: "Consultar ingresos esperados y recibidos",
      ...readOnlyTool,
    },
  })
  getSummary(@Payload() { month }: { month?: string }, @Ctx() ctx: McpContext) {
    return this.income.getSummaryForUser(mcpUserId(ctx), month);
  }
}
