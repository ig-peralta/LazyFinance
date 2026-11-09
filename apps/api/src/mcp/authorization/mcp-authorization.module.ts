import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { EnvironmentModule } from "../../environment/environment.module";
import { PersistenceModule } from "../../persistence/persistence.module";
import { McpAccessGuard } from "./mcp-access.guard";
import { McpAccessRpc } from "./mcp-access.rpc";
import { McpAuthorizationService } from "./mcp-authorization.service";
import { McpInteractionHttp, McpOAuthHttp } from "./oauth.http";
import { MCP_OAUTH_FETCH } from "./oauth-provider";

@Module({
  imports: [AuthModule, EnvironmentModule, PersistenceModule],
  controllers: [McpInteractionHttp, McpOAuthHttp],
  providers: [
    McpAuthorizationService,
    McpAccessGuard,
    McpAccessRpc,
    { provide: MCP_OAUTH_FETCH, useFactory: () => fetch },
  ],
  exports: [McpAuthorizationService, McpAccessGuard],
})
export class McpAuthorizationModule {}
