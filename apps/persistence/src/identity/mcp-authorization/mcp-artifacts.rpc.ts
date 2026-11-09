import {
  McpGrantIdSchema,
  McpRevokeResultSchema,
} from "@lazyfinance/contracts";
import {
  type FindMcpArtifact,
  FindMcpArtifactSchema,
  McpArtifactConsumeResultSchema,
  McpArtifactDestroyResultSchema,
  type McpArtifactKey,
  McpArtifactKeySchema,
  McpArtifactSaveResultSchema,
  McpArtifactSchema,
  McpGrantIdentitySchema,
  type SaveMcpArtifact,
  SaveMcpArtifactSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { McpAuthorizationRepository } from "./mcp-authorization.repository";

@Router({ alias: "mcpArtifacts" })
export class McpArtifactsRpc {
  constructor(private readonly repository: McpAuthorizationRepository) {}

  @Query({
    input: FindMcpArtifactSchema,
    output: McpArtifactSchema.nullable(),
    meta: { context: "mcp-authorization" },
  })
  find(@Input() input: FindMcpArtifact) {
    return this.repository.find(input);
  }

  @Mutation({
    input: SaveMcpArtifactSchema,
    output: McpArtifactSaveResultSchema,
    meta: { context: "mcp-authorization" },
  })
  save(@Input() input: SaveMcpArtifact) {
    return this.repository.save(input);
  }

  @Mutation({
    input: McpArtifactKeySchema,
    output: McpArtifactConsumeResultSchema,
    meta: { context: "mcp-authorization" },
  })
  consume(@Input() input: McpArtifactKey) {
    return this.repository.consume(input);
  }

  @Mutation({
    input: McpArtifactKeySchema,
    output: McpArtifactDestroyResultSchema,
    meta: { context: "mcp-authorization" },
  })
  destroy(@Input() input: McpArtifactKey) {
    return this.repository.destroy(input);
  }

  @Query({
    input: McpGrantIdSchema,
    output: McpGrantIdentitySchema.nullable(),
    meta: { context: "mcp-authorization" },
  })
  identity(@Input() input: { id: string }) {
    return this.repository.identity(input.id);
  }

  @Mutation({
    input: McpGrantIdSchema,
    output: McpRevokeResultSchema,
    meta: { context: "mcp-authorization" },
  })
  revoke(@Input() input: { id: string }) {
    return this.repository.revoke(input.id);
  }
}
