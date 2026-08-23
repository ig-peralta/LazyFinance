import { z } from "zod";

export type EnvironmentVariables = z.infer<typeof ENV_SCHEMA>;

export const ENV_SCHEMA = z.object({
  PORT: z.coerce.number().positive().default(3000),
  POSTGRES_URL: z.url().default("postgresql://user:password@localhost:5432/postgres"),
});
