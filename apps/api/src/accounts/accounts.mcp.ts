import { AccountListItemSchema } from "@lazyfinance/contracts";
import { Ctx } from "@nestjs/microservices";
import { McpContext, McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { mcpUserId, readOnlyTool } from "../mcp/mcp.tools";
import { AccountsService } from "./accounts.service";

@McpController()
export class AccountsMcpController {
  constructor(private readonly accounts: AccountsService) {}

  @Tool({
    name: "get_account_balances",
    description:
      "Consulta los saldos guardados de las cuentas del usuario en CLP y su seguimiento activo, en pausa o sin acceso. Incluye el tipo para distinguir deuda de tarjeta de dinero disponible; null significa saldo desconocido. Los saldos en pausa son últimos valores conocidos. La fecha de origen puede ser desconocida; no asumas datos actuales. No calcula cuánto queda para gastar.",
    annotations: { title: "Consultar saldos de cuentas", ...readOnlyTool },
    outputSchema: z.object({ accounts: z.array(AccountListItemSchema) }),
  })
  async getAccounts(@Ctx() ctx: McpContext) {
    return { accounts: await this.accounts.getActiveForUser(mcpUserId(ctx)) };
  }
}
