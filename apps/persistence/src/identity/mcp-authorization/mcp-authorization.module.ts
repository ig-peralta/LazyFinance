import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { McpArtifactsRpc } from "./mcp-artifacts.rpc";
import { McpAuthorizationRepository } from "./mcp-authorization.repository";
import { McpGrantsRpc } from "./mcp-grants.rpc";

@Module({
  imports: [DatabaseModule],
  providers: [McpAuthorizationRepository, McpArtifactsRpc, McpGrantsRpc],
})
export class McpAuthorizationModule {}
