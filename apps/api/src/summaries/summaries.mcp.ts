import {
  MonthlyComparisonSchema,
  MonthlySummarySchema,
} from '@lazyfinance/contracts';
import { McpContext, McpController, Tool } from '@rekog/mcp-nest';
import { Ctx, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import {
  mcpMonth,
  mcpUserId,
  monthParameters,
  readOnlyTool,
} from '../mcp/mcp.tools';
import { SummariesService } from './summaries.service';

@McpController()
export class SummariesMcpController {
  constructor(private readonly summaries: SummariesService) {}

  @Tool({
    name: 'consultar_resumen_gastos_mensuales',
    description:
      'Resume gastos e ingresos registrados en un mes calendario y desglosa el gasto por etiqueta con importe y número de movimientos, en CLP. Por defecto consulta el mes actual hasta hoy (America/Santiago); excluye transferencias y ahorro entre cuentas. Las etiquetas pueden superponerse: sus importes no necesariamente suman el gasto total. El ingreso del mes indica cuándo llegó dinero, no cuánto queda disponible.',
    parameters: monthParameters,
    annotations: {
      title: 'Consultar gastos por mes y etiqueta',
      ...readOnlyTool,
    },
    outputSchema: MonthlySummarySchema,
  })
  getMonthly(
    @Payload() { month }: z.infer<typeof monthParameters>,
    @Ctx() ctx: McpContext,
  ) {
    return this.summaries.getMonthlyForUser(mcpUserId(ctx), mcpMonth(month));
  }

  @Tool({
    name: 'comparar_gastos_mensuales',
    description:
      'Compara gastos e ingresos de un mes con el anterior en CLP e indica la diferencia absoluta. Para el mes actual compara solo hasta la misma fecha y hora del mes anterior (o su último día si es más corto); los meses pasados se comparan completos. Úsala para responder si se gastó más o menos que el mes anterior, no para proyectar el fin de mes.',
    parameters: monthParameters,
    annotations: {
      title: 'Comparar gastos con el mes anterior',
      ...readOnlyTool,
    },
    outputSchema: MonthlyComparisonSchema,
  })
  getComparison(
    @Payload() { month }: z.infer<typeof monthParameters>,
    @Ctx() ctx: McpContext,
  ) {
    return this.summaries.getComparisonForUser(mcpUserId(ctx), mcpMonth(month));
  }
}
