import { z } from "zod";

export const DemoToolsConfigSchema = z
  .object({ enabled: z.boolean() })
  .strict();
export type DemoToolsConfig = z.infer<typeof DemoToolsConfigSchema>;

// Empty POST mutations may arrive as {}, but never accept a target user ID.
export const DemoDataResetInputSchema = z.strictObject({}).optional();

export const DemoDataResetResultSchema = z
  .object({
    transactionCount: z.number().int().nonnegative(),
  })
  .strict();

export type DemoDataResetResult = z.infer<typeof DemoDataResetResultSchema>;
