import {
  BankingConfigurationSchema,
  BankingConnectionSchema,
  BankingConnectionsSchema,
  BankingImportResultSchema,
  BankingIntentSchema,
  BankingSelectionSchema,
  BankingSyncStatusSchema,
  type CompleteBankingIntent,
  CompleteBankingIntentSchema,
  type CreateBankingIntent,
  CreateBankingIntentSchema,
  DemoBankHistorySchema,
  DemoBankReconnectSchema,
  RpcEmptySchema,
  RpcIdSchema,
  type SelectBankingAccounts,
  SelectBankingAccountsSchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import { PersistenceClient } from "../../persistence/persistence.client";
import { type ApiRequestContext, rpcUser } from "../../rpc/context";
import { FintocDiscoveryService } from "../fintoc/discovery/fintoc-discovery.service";
import { FintocImportService } from "../fintoc/import/fintoc-import.service";
import { MockBankService } from "../mock/mock-bank.service";
import { BankingSyncStatusService } from "../status/banking-sync-status.service";
import { BankingLinksService } from "./banking-links.service";

@Router({ alias: "banking" })
export class BankingLinksRpc {
  constructor(
    private readonly service: BankingLinksService,
    private readonly imports: FintocImportService,
    private readonly status: BankingSyncStatusService,
    private readonly discovery: FintocDiscoveryService,
    private readonly persistence: PersistenceClient,
    private readonly mock: MockBankService,
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
  async importInitial(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { id: string },
  ) {
    const userId = rpcUser(ctx);
    const owned = await this.persistence
      .user(userId)
      .providerLinks.connection.query(input);
    return owned.connection.provider === "mock_bank"
      ? this.mock.importSnapshot(userId, input.id)
      : this.imports.importSnapshot(userId, input.id);
  }

  @Mutation({
    input: RpcIdSchema,
    output: BankingImportResultSchema,
    meta: { auth: "user" },
  })
  async refresh(@Ctx() ctx: ApiRequestContext, @Input() input: { id: string }) {
    const userId = rpcUser(ctx);
    const owned = await this.persistence
      .user(userId)
      .providerLinks.connection.query(input);
    return owned.connection.provider === "mock_bank"
      ? this.mock.importSnapshot(userId, input.id)
      : this.imports.importSnapshot(userId, input.id);
  }

  @Query({
    input: RpcIdSchema,
    output: BankingSyncStatusSchema,
    meta: { auth: "user" },
  })
  syncStatus(@Ctx() ctx: ApiRequestContext, @Input() input: { id: string }) {
    return this.status.forUser(rpcUser(ctx), input.id);
  }

  @Query({
    input: RpcIdSchema,
    output: BankingSelectionSchema,
    meta: { auth: "user" },
  })
  async accountSelection(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { id: string },
  ) {
    return (
      await this.persistence
        .user(rpcUser(ctx))
        .providerSelection.get.query(input)
    ).selection;
  }

  @Mutation({
    input: RpcIdSchema,
    output: BankingSelectionSchema,
    meta: { auth: "user" },
  })
  async discoverAccounts(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { id: string },
  ) {
    const userId = rpcUser(ctx);
    const owned = await this.persistence
      .user(userId)
      .providerLinks.connection.query(input);
    return owned.connection.provider === "mock_bank"
      ? this.mock.discover(userId, input.id)
      : this.discovery.discover(userId, input.id);
  }

  @Query({
    input: RpcIdSchema,
    output: DemoBankHistorySchema,
    meta: { auth: "user" },
  })
  async syncHistory(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { id: string },
  ) {
    const userId = rpcUser(ctx);
    await this.mock.source(userId, input.id);
    return this.persistence.user(userId).demoTools.bankHistory.query(input);
  }

  @Mutation({
    input: RpcIdSchema,
    output: DemoBankReconnectSchema,
    meta: { auth: "user" },
  })
  async reconnectMock(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { id: string },
  ) {
    const userId = rpcUser(ctx);
    await this.mock.source(userId, input.id);
    return this.persistence.user(userId).demoTools.reconnectBank.mutate(input);
  }

  @Mutation({
    input: SelectBankingAccountsSchema,
    output: BankingSelectionSchema,
    meta: { auth: "user" },
  })
  selectAccounts(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: SelectBankingAccounts,
  ) {
    return this.persistence
      .user(rpcUser(ctx))
      .providerSelection.select.mutate(input);
  }
}
