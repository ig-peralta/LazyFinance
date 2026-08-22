import { z } from "zod";
import dotenv from "dotenv";

const envSchema = z.object({
  PORT: z.number().int().positive().default(3000),
  DATABASE_URL: z.url().default("postgresql://user:password@localhost:5432/postgres"),
});

export type EnvVariables = z.infer<typeof envSchema>;

function validateEnv(config: Record<string, unknown>): EnvVariables {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${result.error.message}`);
  }
  return result.data as EnvVariables;
};


export function loadEnv(): EnvVariables {
  dotenv.config({ path: ".env" });
  return validateEnv(process.env);
}
  
