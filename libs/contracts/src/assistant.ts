import { z } from "zod";
import { FinancialActionSchema } from "./financial-actions";

export const ASSISTANT_MAX_TURNS = 24;
export const ASSISTANT_MAX_INPUT = 2000;
export const ASSISTANT_MAX_OUTPUT = 16000;

export const FinancialReadNameSchema = z.enum([
  "consultar_saldos_cuentas",
  "consultar_movimientos_recientes",
  "consultar_presupuestos_y_metas",
  "consultar_avance_presupuestos",
  "consultar_resumen_gastos_mensuales",
  "comparar_gastos_mensuales",
  "consultar_ingresos",
  "consultar_avance_ahorro",
  "consultar_aportes_ahorro",
  "consultar_compras_del_gasto",
  "consultar_compras_presupuesto",
]);

export const AssistantReadNameSchema = z.enum([
  ...FinancialReadNameSchema.options,
  "consultar_etiquetas",
  "buscar_movimientos",
  "consultar_movimiento",
]);
export type AssistantReadName = z.infer<typeof AssistantReadNameSchema>;

export const AssistantSourceSchema = z.object({
  id: z.string().regex(/^F[1-8]$/),
  tool: AssistantReadNameSchema,
  title: z.string().max(120),
  status: z.enum(["available", "unavailable", "limited"]),
  queriedAt: z.iso.datetime(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullable(),
  path: z.enum([
    "/cuentas",
    "/movimientos",
    "/presupuestos-y-metas",
    "/metas",
    "/ingresos",
    "/etiquetas",
  ]),
  // Set only after a successful owned record read; null for section-level reads.
  recordId: z.uuid().nullable(),
  note: z.string().max(600),
  data: z.json(),
});

export const AssistantTurnSchema = z.object({
  id: z.uuid(),
  question: z.string().min(1).max(ASSISTANT_MAX_INPUT),
  text: z.string().max(ASSISTANT_MAX_OUTPUT),
  status: z.enum(["pending", "complete", "interrupted", "failed"]),
  sources: z.array(AssistantSourceSchema).max(8),
  actions: z.array(FinancialActionSchema).max(4),
  createdAt: z.iso.datetime(),
  // Legacy voice records only. Input transcription is disabled; new native turns
  // retain sources/actions without creating or waiting for a readable transcript.
  voice: z
    .object({
      question: z.string().min(1).max(ASSISTANT_MAX_INPUT),
      // An interrupted answer may finish before the asynchronous input record.
      transcriptionPending: z.literal(true).optional(),
    })
    .optional(),
});

export const AssistantConversationSummarySchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(80),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  turnCount: z.number().int().min(0).max(ASSISTANT_MAX_TURNS),
});
export const AssistantConversationSchema =
  AssistantConversationSummarySchema.extend({
    turns: z.array(AssistantTurnSchema).max(ASSISTANT_MAX_TURNS),
  });
export const AssistantConversationsSchema = z
  .array(AssistantConversationSummarySchema)
  .max(10);
export const AssistantConversationIdSchema = z.strictObject({ id: z.uuid() });
// Express normalizes an absent JSON POST body to {}. Both forms create text by
// default; only new-session mode is selectable, never owner or history fields.
export const AssistantConversationModeSchema = z.enum(["text", "voice"]);
export const CreateAssistantConversationSchema = z
  .strictObject({
    mode: AssistantConversationModeSchema.default("text"),
  })
  .default({ mode: "text" });
export const AssistantConfigurationSchema = z.object({
  enabled: z.boolean(),
  provider: z.string().max(100),
  model: z.string().max(200),
  demonstration: z.boolean(),
  maxTurns: z.literal(ASSISTANT_MAX_TURNS),
  maxInput: z.literal(ASSISTANT_MAX_INPUT),
});
export const AssistantSendSchema = z.strictObject({
  conversationId: z.uuid(),
  requestId: z.uuid(),
  text: z.string().trim().min(1).max(ASSISTANT_MAX_INPUT),
});
export const AssistantRemovedSchema = z.object({ removed: z.boolean() });
export const AssistantEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("turn"), turn: AssistantTurnSchema }),
  z.object({ type: z.literal("status"), text: z.string().max(200) }),
  z.object({ type: z.literal("source"), source: AssistantSourceSchema }),
  z.object({ type: z.literal("action"), action: FinancialActionSchema }),
  z.object({
    type: z.literal("action_updated"),
    action: FinancialActionSchema,
  }),
  z.object({
    type: z.literal("delta"),
    text: z.string().max(ASSISTANT_MAX_OUTPUT),
  }),
  z.object({ type: z.literal("done"), turn: AssistantTurnSchema }),
  z.object({ type: z.literal("error"), message: z.string().max(500) }),
]);

export type FinancialReadName = z.infer<typeof FinancialReadNameSchema>;
export type AssistantSource = z.infer<typeof AssistantSourceSchema>;
export type AssistantTurn = z.infer<typeof AssistantTurnSchema>;
export type AssistantConversation = z.infer<typeof AssistantConversationSchema>;
export type AssistantConversationSummary = z.infer<
  typeof AssistantConversationSummarySchema
>;
export type AssistantSend = z.infer<typeof AssistantSendSchema>;
export type AssistantEvent = z.infer<typeof AssistantEventSchema>;
