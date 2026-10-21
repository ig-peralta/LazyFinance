import {
  BudgetProgressSchema,
  ObjectiveSummarySchema,
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
import { ObjectivesService } from './objectives.service';

@McpController()
export class ObjectivesMcpController {
  constructor(private readonly objectives: ObjectivesService) {}

  @Tool({
    name: 'consultar_presupuestos_y_metas',
    description:
      'Lista los presupuestos de gasto y las metas de ahorro definidos por el usuario, con importes, períodos y etiquetas. Úsala para conocer los límites y objetivos configurados; no incluye el avance ni los aportes de las metas de ahorro.',
    annotations: { title: 'Consultar presupuestos y metas', ...readOnlyTool },
    outputSchema: z.object({ objectives: z.array(ObjectiveSummarySchema) }),
  })
  async getObjectives(@Ctx() ctx: McpContext) {
    return { objectives: await this.objectives.getForUser(mcpUserId(ctx)) };
  }

  @Tool({
    name: 'consultar_avance_presupuestos',
    description:
      'Calcula por presupuesto de gasto el límite, gasto acumulado, saldo restante y porcentaje consumido para un mes en CLP. Si no se indica mes, usa el actual en America/Santiago. Cada compra tiene como máximo una etiqueta y cuenta una vez si coincide con alguna del presupuesto; no calcula avance de metas de ahorro.',
    parameters: monthParameters,
    annotations: {
      title: 'Consultar avance de presupuestos de gasto',
      ...readOnlyTool,
    },
    outputSchema: z.object({ budgets: z.array(BudgetProgressSchema) }),
  })
  async getSpendingProgress(
    @Payload() { month }: z.infer<typeof monthParameters>,
    @Ctx() ctx: McpContext,
  ) {
    return {
      budgets: await this.objectives.getSpendingProgressForUser(
        mcpUserId(ctx),
        mcpMonth(month),
      ),
    };
  }
}
