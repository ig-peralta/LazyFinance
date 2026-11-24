import { z } from "zod";

export const DemoToolsConfigSchema = z
  .object({ enabled: z.boolean() })
  .strict();
export type DemoToolsConfig = z.infer<typeof DemoToolsConfigSchema>;

// Empty POST mutations may arrive as {}, but never accept a target user ID.
export const DemoDataResetInputSchema = z.strictObject({}).optional();

// Generation is server-side. Neither a target owner nor an account is an input.
export const DemoTransactionInputSchema = z.strictObject({}).optional();

export const DemoTransactionResultSchema = z.strictObject({
  transactionCount: z.number().int().min(1).max(2),
  description: z.string().min(1).max(240),
  amount: z.string().regex(/^[1-9]\d{0,12}\.\d{2}$/),
});
export type DemoTransactionResult = z.infer<typeof DemoTransactionResultSchema>;

export const DemoDataResetResultSchema = z
  .object({
    transactionCount: z.number().int().nonnegative(),
    connectionId: z.uuid(),
    status: z.enum(["ready", "incomplete"]),
  })
  .strict();

export type DemoDataResetResult = z.infer<typeof DemoDataResetResultSchema>;

export const DemoBankPreparationSchema = z
  .strictObject({
    connectionId: z.uuid(),
    transactionCount: z.number().int().nonnegative(),
    prepared: z.boolean(),
  })
  .nullable();

export const DemoBankHistorySchema = z.array(
  z.strictObject({
    occurredAt: z.iso.datetime(),
    origin: z.enum(["generated", "executed"]),
    result: z.enum(["complete", "needs_review", "failed"]),
    movementCount: z.number().int().nonnegative(),
    failureReason: z.string().nullable(),
  }),
);

export const DemoBankReconnectSchema = z.strictObject({
  status: z.literal("active"),
});

export const DemoBankFailureInputSchema = z.strictObject({
  failure: z.enum(["retryable", "expired"]).nullable(),
});

export const DemoBankFailureResultSchema = z.strictObject({
  failure: z.enum(["retryable", "expired"]).nullable(),
});

export const DemoBankChangeInputSchema = z.strictObject({
  action: z.enum(["correct", "remove"]),
});
