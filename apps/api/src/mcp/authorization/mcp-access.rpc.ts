import {
  McpAccessConfigurationSchema,
  McpGrantIdSchema,
  McpGrantsSchema,
  McpRevokeResultSchema,
  RpcEmptySchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import { type ApiRequestContext, rpcUser } from "../../rpc/context";
import { McpAuthorizationService } from "./mcp-authorization.service";

@Router({ alias: "mcpAccess" })
export class McpAccessRpc {
  constructor(private readonly authorization: McpAuthorizationService) {}

  @Query({
    input: RpcEmptySchema,
    output: McpAccessConfigurationSchema,
    meta: { auth: "user" },
  })
  configuration() {
    return { enabled: !!this.authorization.settings };
  }

  @Query({
    input: RpcEmptySchema,
    output: McpGrantsSchema,
    meta: { auth: "user" },
  })
  grants(@Ctx() ctx: ApiRequestContext) {
    return this.authorization.grants(rpcUser(ctx));
  }

  @Mutation({
    input: McpGrantIdSchema,
    output: McpRevokeResultSchema,
    meta: { auth: "user" },
  })
  revoke(@Ctx() ctx: ApiRequestContext, @Input() input: { id: string }) {
    return this.authorization.revoke(rpcUser(ctx), input.id);
  }
}
