import {
  AuthConfigSchema,
  AuthPrincipalSchema,
  type MockLoginInput,
  MockLoginInputSchema,
  MockLoginResultSchema,
  RpcEmptySchema,
} from "@lazyfinance/contracts";
import { Inject } from "@nestjs/common";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import type { ApiRequestContext } from "../rpc/api.context";
import { AuthService } from "./auth.service";

@Router({ alias: "auth" })
export class AuthRpc {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Query({
    input: RpcEmptySchema,
    output: AuthConfigSchema,
    meta: { auth: "public" },
  })
  config() {
    return this.auth.config();
  }

  @Mutation({
    input: MockLoginInputSchema,
    output: MockLoginResultSchema,
    meta: { auth: "public" },
  })
  loginMock(@Input() input: MockLoginInput) {
    return this.auth.loginMock(input);
  }

  @Query({
    input: RpcEmptySchema,
    output: AuthPrincipalSchema,
    meta: { auth: "user" },
  })
  principal(@Ctx() ctx: ApiRequestContext) {
    return ctx.principal;
  }
}
