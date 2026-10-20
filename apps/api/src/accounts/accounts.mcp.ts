import { AccountSummarySchema } from '@lazyfinance/contracts';
import { McpContext, McpController, Tool } from '@rekog/mcp-nest';
import { Ctx } from '@nestjs/microservices';
import { z } from 'zod';
import { mcpUserId, readOnlyTool } from '../mcp/mcp.tools';
import { AccountsService } from './accounts.service';

@McpController()
export class AccountsMcpController {
  constructor(private readonly accounts: AccountsService) {}

  @Tool({
    name: 'consultar_saldos_cuentas',
    description:
      'Consulta los saldos actuales de las cuentas activas del usuario en CLP. Incluye el tipo de cuenta para distinguir el saldo de una tarjeta de crédito del dinero disponible. Incluye lastSyncedAt; si viene vacío es porque todavía no hay sincronización real con el banco (datos de demostración), no asumas que el saldo está actualizado al momento. Úsala para preguntas sobre cuánto dinero hay en las cuentas; no calcula cuánto queda para gastar.',
    annotations: { title: 'Consultar saldos de cuentas', ...readOnlyTool },
    outputSchema: z.object({ accounts: z.array(AccountSummarySchema) }),
  })
  async getAccounts(@Ctx() ctx: McpContext) {
    return { accounts: await this.accounts.getActiveForUser(mcpUserId(ctx)) };
  }
}
