import {
  BudgetContributionsInputSchema,
  SpendingContributionsInputSchema,
  SpendingContributionsPageSchema,
} from "@lazyfinance/contracts";
import { Ctx, Payload } from "@nestjs/microservices";
import { McpContext, McpController, Tool } from "@rekog/mcp-nest";
import type { z } from "zod";
import { mcpUserId, readOnlyTool } from "../mcp/mcp.tools";
import { SpendingEvidenceService } from "./spending-evidence.service";

@McpController()
export class SpendingEvidenceMcpController {
  constructor(private readonly evidence: SpendingEvidenceService) {}

  @Tool({
    name: "consultar_compras_del_gasto",
    description:
      "Traza el gasto mensual propio hasta sus compras: costo bruto, devoluciones, reembolsos y neto atribuidos a la compra original. Incluye importes sin etiqueta en el total general; tagId null consulta solo esos movimientos. Los totales son completos, no la suma de una página. Conserva mes, filtros, asOf y adjustmentsAsOf de tracking para continuar; usa el adjustmentsAsOf del resumen para explicar ese resultado.",
    parameters: SpendingContributionsInputSchema,
    annotations: {
      title: "Consultar compras que explican el gasto",
      ...readOnlyTool,
    },
    outputSchema: SpendingContributionsPageSchema,
  })
  summary(
    @Payload() input: z.infer<typeof SpendingContributionsInputSchema>,
    @Ctx() ctx: McpContext,
  ) {
    return this.evidence.summary(mcpUserId(ctx), input);
  }

  @Tool({
    name: "consultar_compras_presupuesto",
    description:
      "Traza el gasto de un presupuesto propio usando id, revisionId y mes de su avance. Reutiliza las etiquetas históricas y los límites exactos de activación y archivo; recuperaciones posteriores siguen la compra original. No incluye compras sin etiqueta. Conserva asOf y adjustmentsAsOf de tracking al paginar, y usa el corte del avance para reconciliar sus totales completos de bruto, recuperaciones y neto.",
    parameters: BudgetContributionsInputSchema,
    annotations: {
      title: "Consultar compras de un presupuesto",
      ...readOnlyTool,
    },
    outputSchema: SpendingContributionsPageSchema,
  })
  budget(
    @Payload() input: z.infer<typeof BudgetContributionsInputSchema>,
    @Ctx() ctx: McpContext,
  ) {
    return this.evidence.budget(mcpUserId(ctx), input);
  }
}
