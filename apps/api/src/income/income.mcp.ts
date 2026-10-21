import { IncomeSummarySchema, MonthSchema } from '@lazyfinance/contracts';
import { McpContext, McpController, Tool } from '@rekog/mcp-nest';
import { Ctx, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import { mcpUserId, readOnlyTool } from '../mcp/mcp.tools';
import { IncomeService } from './income.service';

@McpController()
export class IncomeMcpController {
  constructor(private readonly income: IncomeService) {}

  @Tool({
    name: 'consultar_ingresos',
    description: 'Consulta los ingresos esperados del mes completo según las fuentes declaradas y los ingresos recibidos confirmados hasta asOf, en CLP. Incluye fechas de pago, estimaciones, cantidades desconocidas y créditos sin clasificar. Los importes esperados no son dinero disponible; no se suman a los recibidos. Permite meses futuros para consultar expectativas, sin inventar cobros.',
    parameters: z.object({
      month: MonthSchema.optional().describe('Mes YYYY-MM en America/Santiago; por defecto el actual. Se permiten meses futuros para expectativas.'),
    }),
    outputSchema: IncomeSummarySchema,
    annotations: { title: 'Consultar ingresos esperados y recibidos', ...readOnlyTool },
  })
  getSummary(@Payload() { month }: { month?: string }, @Ctx() ctx: McpContext) {
    return this.income.getSummaryForUser(mcpUserId(ctx), month);
  }
}
