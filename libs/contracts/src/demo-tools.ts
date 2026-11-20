import { z } from "zod";

export const DemoToolsConfigSchema = z
  .object({ enabled: z.boolean() })
  .strict();
export type DemoToolsConfig = z.infer<typeof DemoToolsConfigSchema>;

export const DemoDataResetResultSchema = z
  .object({
    transactionCount: z.number().int().nonnegative(),
  })
  .strict();

export type DemoDataResetResult = z.infer<typeof DemoDataResetResultSchema>;
