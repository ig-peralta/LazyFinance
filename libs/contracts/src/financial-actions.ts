import { z } from "zod";
import { CreateBudgetInputSchema } from "./objectives/budget-management.schema";
import { CreateSavingsGoalSchema } from "./objectives/savings-goal.schema";
import { UpdateTagSchema } from "./tags/tag-management.schema";
import { TagCreateInputSchema } from "./tags/tag-rule.schema";
import { TagSummarySchema } from "./tags/tag-summary.schema";
import { RecentTransactionSchema } from "./transactions/recent-transaction.schema";

export const FinancialWriteScopeSchema = z.enum([
  "finance:budgets:write",
  "finance:goals:write",
  "finance:tags:write",
  "finance:movements:tag",
]);
export const McpPermissionSchema = z.enum([
  "finance:read",
  ...FinancialWriteScopeSchema.options,
  "openid",
  "offline_access",
]);
export const MCP_PERMISSION_LABELS: Record<
  z.infer<typeof McpPermissionSchema>,
  string
> = {
  "finance:read": "Consultar información financiera",
  "finance:budgets:write": "Crear presupuestos",
  "finance:goals:write": "Crear metas de ahorro",
  "finance:tags:write": "Crear, editar y archivar etiquetas",
  "finance:movements:tag": "Cambiar decisiones de etiquetado de movimientos",
  openid: "Identificar la cuenta autorizada",
  offline_access: "Mantener acceso hasta su vencimiento o revocación",
};

const tagIds = z
  .array(z.uuid())
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, "Select distinct tags");
const newTags = z
  .array(TagCreateInputSchema)
  .max(5)
  .refine(
    (tags) => new Set(tags.map((tag) => tag.name)).size === tags.length,
    "Select distinct new tags",
  );

// The non-empty selection must survive JSON Schema conversion for model tools,
// not only Zod's runtime refinement. Neither alternative permits a tagless goal.
const selectedObjective = <Shape extends z.ZodRawShape>(
  fields: z.ZodObject<Shape>,
) =>
  z
    .union([
      fields.extend({ tagIds: tagIds.min(1), newTags: newTags.default([]) }),
      fields.extend({ tagIds: tagIds.default([]), newTags: newTags.min(1) }),
    ])
    .describe(
      "Requiere al menos una etiqueta existente en tagIds o una etiqueta nueva en newTags. No admite presupuestos ni metas sin etiquetas.",
    );

export const TagActionRequestSchemas = [
  z.strictObject({ kind: z.literal("create_tag"), tag: TagCreateInputSchema }),
  z.strictObject({ kind: z.literal("update_tag"), tag: UpdateTagSchema }),
  z.strictObject({ kind: z.literal("archive_tag"), id: z.uuid() }),
  z.strictObject({
    kind: z.literal("tag_movement"),
    transactionId: z.uuid(),
    tagId: z.uuid().nullable(),
  }),
  z.strictObject({
    kind: z.literal("reset_movement_tag"),
    transactionId: z.uuid(),
  }),
] as const;
export const FinancialActionRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("create_budget"),
    budget: selectedObjective(CreateBudgetInputSchema.omit({ tagIds: true })),
  }),
  z.strictObject({
    kind: z.literal("create_savings_goal"),
    goal: selectedObjective(CreateSavingsGoalSchema.omit({ tagIds: true })),
  }),
  ...TagActionRequestSchemas,
]);
export type FinancialActionRequest = z.infer<
  typeof FinancialActionRequestSchema
>;

/** Permissions are part of the command contract, independent of the model or transport. */
export function financialActionScopes(action: FinancialActionRequest) {
  const scopes: z.infer<typeof FinancialWriteScopeSchema>[] = [];
  if (action.kind === "create_budget") scopes.push("finance:budgets:write");
  else if (action.kind === "create_savings_goal")
    scopes.push("finance:goals:write");
  else if (
    action.kind === "tag_movement" ||
    action.kind === "reset_movement_tag"
  )
    scopes.push("finance:movements:tag");
  else scopes.push("finance:tags:write");
  if (
    (action.kind === "create_budget" && action.budget.newTags.length) ||
    (action.kind === "create_savings_goal" && action.goal.newTags.length)
  )
    scopes.push("finance:tags:write");
  return scopes;
}

// MCP and model function schemas require an object root, not a root union.
export const FinancialActionInputSchema = z.strictObject({
  action: FinancialActionRequestSchema,
});

export const FinancialActionContextSchema = z.object({
  tags: z.array(TagSummarySchema.extend({ isArchived: z.boolean() })).max(55),
  movement: RecentTransactionSchema.extend({
    removedAt: z.iso.datetime().nullable(),
  }).nullable(),
});
export const FinancialActionResultSchema = z.object({
  id: z.uuid(),
  title: z.string().max(160),
  path: z
    .string()
    .regex(
      /^\/(?:etiquetas|presupuestos\/[0-9a-f-]{36}|metas\/[0-9a-f-]{36}|movimientos\/[0-9a-f-]{36})$/,
    ),
  outcome: z.enum([
    "created",
    "updated",
    "archived",
    "tagged",
    "reset",
    "unchanged",
  ]),
});
export const FinancialActionSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  conversationId: z.uuid().nullable(),
  turnId: z.uuid().nullable(),
  origin: z.enum(["assistant", "mcp"]),
  request: FinancialActionRequestSchema,
  context: FinancialActionContextSchema,
  status: z.enum(["proposed", "applied", "cancelled", "expired", "stale"]),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  results: z.array(FinancialActionResultSchema).max(6),
});
export type FinancialAction = z.infer<typeof FinancialActionSchema>;
export const FinancialActionIdSchema = z.strictObject({ id: z.uuid() });
export const FinancialActionVersionSchema = FinancialActionIdSchema.extend({
  version: z.number().int().positive(),
});
export const ReviseFinancialActionSchema = FinancialActionVersionSchema.extend({
  action: FinancialActionRequestSchema,
});
export const FinancialActionPreviewSchema = z.object({
  action: FinancialActionRequestSchema,
  context: FinancialActionContextSchema,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export const DirectFinancialActionSchema = z
  .strictObject({
    requestId: z.uuid(),
    action: FinancialActionRequestSchema,
    expectedFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .refine(
    (value) =>
      ["create_budget", "create_savings_goal", "create_tag"].includes(
        value.action.kind,
      ) || !!value.expectedFingerprint,
    "Preview existing records before changing them",
  );
