import {
  McpGrantIdSchema,
  McpGrantSchema,
  McpGrantsSchema,
  McpRevokeResultSchema,
  RpcEmptySchema,
} from "@lazyfinance/contracts";
import {
  type BindMcpGrant,
  BindMcpGrantSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { McpAuthorizationRepository } from "./mcp-authorization.repository";

@Router({ alias: "mcpGrants" })
export class McpGrantsRpc {
  constructor(private readonly repository: McpAuthorizationRepository) {}

  @Query({
    input: RpcEmptySchema,
    output: McpGrantsSchema,
    meta: { context: "user" },
  })
  list() {
    return this.repository.list();
  }

  @Mutation({
    input: BindMcpGrantSchema,
    output: McpGrantSchema,
    meta: { context: "user" },
  })
  bind(@Input() input: BindMcpGrant) {
    return this.repository.bind(input);
  }

  @Mutation({
    input: McpGrantIdSchema,
    output: McpRevokeResultSchema,
    meta: { context: "user" },
  })
  revoke(@Input() input: { id: string }) {
    return this.repository.revoke(input.id);
  }
}
