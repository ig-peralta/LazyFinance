import { z } from "zod";
import { AuthConfigSchema } from "./auth";
import { DemoToolsConfigSchema } from "./demo-tools";

export const AppConfigSchema = z
  .object({
    auth: AuthConfigSchema,
    demoTools: DemoToolsConfigSchema,
  })
  .strict();

export type AppConfig = z.infer<typeof AppConfigSchema>;
