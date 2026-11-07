import {
  ENV_SCHEMA,
  type EnvironmentVariables,
} from "../../src/environment/environment.schema";
import type { EnvironmentService } from "../../src/environment/environment.service";

/** Output-shaped settings; overrides can model invalid startup combinations. */
export function testEnvironment(
  overrides: Partial<EnvironmentVariables> = {},
): EnvironmentService {
  const values: EnvironmentVariables = {
    ...ENV_SCHEMA.parse({
      NODE_ENV: "test",
      AUTH_PROVIDER: "mock",
      PERSISTENCE_RPC_URL: process.env.TEST_PERSISTENCE_RPC_URL,
      PERSISTENCE_RPC_PRIVATE_KEY: process.env.TEST_PERSISTENCE_RPC_PRIVATE_KEY,
    }),
    ...overrides,
  };
  const environment = {
    get<Key extends keyof EnvironmentVariables>(
      key: Key,
    ): EnvironmentVariables[Key] {
      return values[key];
    },
  } satisfies Pick<EnvironmentService, "get">;

  // The fake implements the public getter, not the class's private cache/logger.
  return environment as EnvironmentService;
}
