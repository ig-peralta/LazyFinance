import {
  BankingConfigurationSchema,
  BankingConnectionSchema,
  BankingConnectionsSchema,
  BankingImportResultSchema,
  BankingIntentSchema,
  type CompleteBankingIntent,
  CompleteBankingIntentSchema,
  type CreateBankingIntent,
  CreateBankingIntentSchema,
  RpcEmptySchema,
  RpcIdSchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import { type ApiRequestContext, rpcUser } from "../../rpc/context";
import { FintocImportService } from "../fintoc/import/fintoc-import.service";
import { BankingLinksService } from "./banking-links.service";

@Router({ alias: "banking" })
export class BankingLinksRpc {
  constructor(
    private readonly service: BankingLinksService,
    private readonly imports: FintocImportService,
  ) {}

  @Query({
    input: RpcEmptySchema,
    output: BankingConfigurationSchema,
    meta: { auth: "user" },
  })
  configuration() {
    return this.service.configuration();
  }

  @Query({
    input: RpcEmptySchema,
    output: BankingConnectionsSchema,
    meta: { auth: "user" },
  })
  connections(@Ctx() ctx: ApiRequestContext) {
    return this.service.list(rpcUser(ctx));
  }

  @Mutation({
    input: CreateBankingIntentSchema,
    output: BankingIntentSchema,
    meta: { auth: "user" },
  })
  createLinkIntent(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: CreateBankingIntent,
  ) {
    return this.service.createIntent(rpcUser(ctx), input);
  }

  @Mutation({
    input: CompleteBankingIntentSchema,
    output: BankingConnectionSchema,
    meta: { auth: "user" },
  })
  completeLink(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: CompleteBankingIntent,
  ) {
    return this.service.complete(rpcUser(ctx), input);
  }

  @Mutation({
    input: RpcIdSchema,
    output: BankingConnectionSchema,
    meta: { auth: "user" },
  })
  checkConnection(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { id: string },
  ) {
    return this.service.check(rpcUser(ctx), input.id);
  }

  @Mutation({
    input: RpcIdSchema,
    output: BankingConnectionSchema,
    meta: { auth: "user" },
  })
  disconnect(@Ctx() ctx: ApiRequestContext, @Input() input: { id: string }) {
    return this.service.disconnect(rpcUser(ctx), input.id);
  }

  @Mutation({
    input: RpcIdSchema,
    output: BankingImportResultSchema,
    meta: { auth: "user" },
  })
  importInitial(@Ctx() ctx: ApiRequestContext, @Input() input: { id: string }) {
    return this.imports.importInitial(rpcUser(ctx), input.id);
  }
}
