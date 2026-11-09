import {
  DirectFinancialActionSchema,
  FinancialActionInputSchema,
  FinancialActionPreviewSchema,
  FinancialActionRequestSchema,
  FinancialActionSchema,
  financialActionScopes,
  TagSummarySchema,
  TransactionDetailSchema,
  TransactionsInputSchema,
  TransactionsPageSchema,
} from "@lazyfinance/contracts";
import { Ctx, Payload, RpcException } from "@nestjs/microservices";
import { McpContext, McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import type { McpAuthenticatedRequest } from "../mcp/authorization/mcp-access.guard";
import { mcpUserId, readOnlyTool } from "../mcp/mcp.tools";
import { TaggingService } from "../transactions/tagging/tagging.service";
import { TransactionsService } from "../transactions/transactions.service";
import { ActionsService } from "./actions.service";

const writeTool = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

@McpController()
export class ActionsMcpController {
  constructor(
    private readonly actions: ActionsService,
    private readonly tags: TaggingService,
    private readonly movements: TransactionsService,
  ) {}

  private permission(
    ctx: McpContext,
    action: z.infer<typeof FinancialActionRequestSchema>,
  ) {
    const permission = ctx.getRawRequest<McpAuthenticatedRequest>()?.mcp;
    if (
      !permission ||
      !financialActionScopes(action).every((scope) =>
        permission.scopes.includes(scope),
      )
    )
      throw new RpcException(
        "Esta conexión necesita permisos de escritura explícitos para esta acción. Vuelve a autorizar los permisos necesarios; finance:read no permite cambios.",
      );
    return permission;
  }

  @Tool({
    name: "previsualizar_accion_financiera",
    description:
      "Valida una acción propia y devuelve su selección exacta y fingerprint, sin ejecutarla ni crear una solicitud de aprobación. Requiere permisos de escritura para la acción. Antes de cambiar etiquetas existentes o decisiones de movimientos usa este fingerprint en ejecutar_accion_financiera.",
    parameters: FinancialActionInputSchema,
    outputSchema: FinancialActionPreviewSchema,
    annotations: { title: "Previsualizar cambio financiero", ...readOnlyTool },
  })
  preview(
    @Payload() input: z.infer<typeof FinancialActionInputSchema>,
    @Ctx() ctx: McpContext,
  ) {
    this.permission(ctx, input.action);
    return this.actions.preview(mcpUserId(ctx), input.action);
  }

  @Tool({
    name: "ejecutar_accion_financiera",
    description:
      "Ejecuta directamente una acción dentro de los permisos OAuth explícitos de esta conexión: crear presupuesto/meta, gestionar etiquetas o etiquetar UN movimiento. No usa la aprobación del chat. requestId debe ser un UUID estable por intención: reintentos idénticos devuelven el recibo, nunca duplican el cambio; no cambies requestId tras un resultado incierto. Para editar/archivar/etiquetar exige expectedFingerprint de la previsualización actual. newTags y objetivo se guardan juntos. No mueve dinero, confirma ingresos ni crea reglas automáticas.",
    parameters: DirectFinancialActionSchema,
    outputSchema: FinancialActionSchema,
    annotations: {
      title: "Ejecutar cambio financiero autorizado",
      ...writeTool,
    },
  })
  execute(
    @Payload() input: z.infer<typeof DirectFinancialActionSchema>,
    @Ctx() ctx: McpContext,
  ) {
    const permission = this.permission(ctx, input.action);
    return this.actions.execute(
      mcpUserId(ctx),
      permission.grantId,
      permission.clientId,
      input,
    );
  }

  @Tool({
    name: "consultar_etiquetas",
    description:
      "Lista etiquetas propias activas con IDs reales para presupuestos, metas y decisiones de etiquetado.",
    outputSchema: z.object({ tags: z.array(TagSummarySchema).max(10000) }),
    annotations: { title: "Consultar etiquetas", ...readOnlyTool },
  })
  async listTags(@Ctx() ctx: McpContext) {
    return { tags: await this.tags.listTagsForUser(mcpUserId(ctx)) };
  }

  @Tool({
    name: "buscar_movimientos",
    description:
      "Busca una página de movimientos propios por cuenta, fechas, comercio y etiqueta. No sumes páginas como totales; tagId:null también incluye decisiones manuales deliberadas sin etiqueta. Respeta tagDecisionOrigin y conserva el cursor y filtros al continuar.",
    parameters: TransactionsInputSchema,
    outputSchema: TransactionsPageSchema,
    annotations: { title: "Buscar movimientos", ...readOnlyTool },
  })
  listMovements(
    @Payload() input: z.infer<typeof TransactionsInputSchema>,
    @Ctx() ctx: McpContext,
  ) {
    return this.movements.listForUser(mcpUserId(ctx), input);
  }

  @Tool({
    name: "consultar_movimiento",
    description:
      "Consulta el detalle actual de un movimiento propio y su clasificación antes de proponer cambios. Etiquetar no confirma ingresos ni identifica transferencias internas.",
    parameters: z.strictObject({ id: z.uuid() }),
    outputSchema: TransactionDetailSchema,
    annotations: { title: "Consultar movimiento", ...readOnlyTool },
  })
  detail(@Payload() input: { id: string }, @Ctx() ctx: McpContext) {
    return this.movements.detailForUser(mcpUserId(ctx), input.id);
  }
}
