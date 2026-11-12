import {
  BudgetProgressSchema,
  ObjectiveSummarySchema,
  SavingsEvidenceInputSchema,
  SavingsEvidencePageSchema,
  SavingsProgressInputSchema,
  SavingsProgressSchema,
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
import { ObjectivesService } from "./objectives.service";
import { SavingsProgressService } from "./savings-progress.service";

@McpController()
export class ObjectivesMcpController {
  constructor(
    private readonly objectives: ObjectivesService,
    private readonly savings: SavingsProgressService,
  ) {}

  @Tool({
    name: "get_savings_progress",
    description:
      "Consulta una meta propia por id: aportes, retiros, asignación neta, restante y porcentaje exactos según movimientos de efectivo etiquetados. No representa saldo bancario, ingresos ni nueva riqueza. Incluye período, corte y cobertura de historia incompleta; las metas con etiquetas compartidas se superponen y no deben sumarse.",
    parameters: SavingsProgressInputSchema,
    annotations: {
      title: "Consultar avance de una meta de ahorro",
      ...readOnlyTool,
    },
    outputSchema: SavingsProgressSchema,
  })
  getSavingsProgress(
    @Payload() input: z.infer<typeof SavingsProgressInputSchema>,
    @Ctx() ctx: McpContext,
  ) {
    return this.savings.progress(mcpUserId(ctx), input);
  }

  @Tool({
    name: "get_savings_contributions",
    description:
      "Pagina la evidencia de una meta propia: movimientos etiquetados de cuentas corrientes/ahorro, con aportes, retiros y pendientes de revisión. Usa los mismos cortes y reglas del avance; excluye tarjetas y eliminados. Para continuar conserva id, mes y el asOf de tracking de la página anterior; no sumes páginas como si fueran saldos bancarios.",
    parameters: SavingsEvidenceInputSchema,
    annotations: {
      title: "Consultar evidencia de aportes y retiros",
      ...readOnlyTool,
    },
    outputSchema: SavingsEvidencePageSchema,
  })
  getSavingsEvidence(
    @Payload() input: z.infer<typeof SavingsEvidenceInputSchema>,
    @Ctx() ctx: McpContext,
  ) {
    return this.savings.evidence(mcpUserId(ctx), input);
  }

  @Tool({
    name: "get_budgets_and_goals",
    description:
      "Lista los presupuestos de gasto y las metas de ahorro definidos por el usuario, con importes, períodos y etiquetas. Úsala para conocer los límites y objetivos configurados; no incluye el avance ni los aportes de las metas de ahorro.",
    annotations: { title: "Consultar presupuestos y metas", ...readOnlyTool },
    outputSchema: z.object({ objectives: z.array(ObjectiveSummarySchema) }),
  })
  async getObjectives(@Ctx() ctx: McpContext) {
    return { objectives: await this.objectives.getForUser(mcpUserId(ctx)) };
  }

  @Tool({
    name: "get_budget_progress",
    description:
      "Calcula por presupuesto el límite, compras brutas, devoluciones, reembolsos, gasto neto y saldo restante en CLP. Los ajustes confirmados siguen el período y etiqueta de la compra original, incluso en presupuestos archivados; no admiten compras posteriores al archivo. Usa el mes actual en America/Santiago por defecto. Cada compra cuenta una vez por presupuesto; no calcula avance de ahorro.",
    parameters: monthParameters,
    annotations: {
      title: "Consultar avance de presupuestos de gasto",
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
