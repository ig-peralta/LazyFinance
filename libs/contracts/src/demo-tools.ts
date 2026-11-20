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
  })
  .strict();

export type DemoDataResetResult = z.infer<typeof DemoDataResetResultSchema>;
