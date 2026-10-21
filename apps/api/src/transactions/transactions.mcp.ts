import { RecentTransactionSchema } from '@lazyfinance/contracts';
import { McpContext, McpController, Tool } from '@rekog/mcp-nest';
import { Ctx } from '@nestjs/microservices';
import { z } from 'zod';
import { mcpUserId, readOnlyTool } from '../mcp/mcp.tools';
import { TransactionsService } from './transactions.service';

@McpController()
export class TransactionsMcpController {
  constructor(private readonly transactions: TransactionsService) {}

  @Tool({
    name: 'consultar_movimientos_recientes',
    description:
      'Devuelve hasta diez movimientos bancarios recientes del usuario, ordenados del más nuevo al más antiguo, con importe, fecha, cuenta y una etiqueta o null si no está clasificado. Úsala para identificar compras recientes; no sirve para buscar todo el historial ni para detectar automáticamente anomalías o duplicados.',
    annotations: { title: 'Consultar movimientos recientes', ...readOnlyTool },
    outputSchema: z.object({ transactions: z.array(RecentTransactionSchema) }),
  })
  async getRecent(@Ctx() ctx: McpContext) {
    return {
      transactions: await this.transactions.getRecentForUser(mcpUserId(ctx)),
    };
  }
}
