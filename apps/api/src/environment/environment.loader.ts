import { ENV_SCHEMA, EnvironmentVariables } from "./environment.schema";
import dotenv from "dotenv";

function validateDotenv(config: Record<string, unknown>): EnvironmentVariables {
  const result = ENV_SCHEMA.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${result.error.message}`);
  }
  return result.data as EnvironmentVariables;
};

export function loadEnvironmentVariables(): EnvironmentVariables {
  dotenv.config({ path: ".env", quiet: true });
  return validateDotenv(process.env);
}
