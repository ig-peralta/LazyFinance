import { AppConfigSchema, RpcEmptySchema } from "@lazyfinance/contracts";
import { Query, Router } from "nestjs-trpc";
import { EnvironmentService } from "../environment/environment.service";

@Router({ alias: "config" })
export class ConfigRpc {
  constructor(private readonly environment: EnvironmentService) {}

  @Query({
    input: RpcEmptySchema,
    output: AppConfigSchema,
    meta: { auth: "public" },
  })
  get() {
    return {
      auth: { provider: this.environment.get("AUTH_PROVIDER") },
      demoTools: { enabled: this.environment.get("DEMO_TOOLS_ENABLED") },
    };
  }
}
