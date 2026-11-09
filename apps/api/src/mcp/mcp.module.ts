import { Global, Module } from "@nestjs/common";
import { MCP_STRATEGY } from "@rekog/mcp-nest";
import { McpAuthorizationModule } from "./authorization/mcp-authorization.module";
import { McpHttpController } from "./mcp.http";
import { mcpStrategy } from "./mcp.strategy";

@Global()
@Module({
  imports: [McpAuthorizationModule],
  controllers: [McpHttpController],
  providers: [
    {
      provide: MCP_STRATEGY,
      useValue: mcpStrategy,
    },
  ],
  exports: [MCP_STRATEGY],
})
export class McpModule {}
