import { Module } from "@nestjs/common";
import { McpModule as NestJSMcpModule } from "@nestjs-mcp/server";
import { McpResolver } from "./mcp.resolver";

@Module({
  imports: [
    NestJSMcpModule.forRoot({
      name: "MCP Server",
      version: "1.0.0",
    }),
  ],
  providers: [
    McpResolver,
  ],
})
export class McpModule {}
