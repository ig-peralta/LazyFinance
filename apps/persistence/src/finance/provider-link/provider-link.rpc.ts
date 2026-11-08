import {
  BankingConnectionSchema,
  BankingConnectionsSchema,
} from "@lazyfinance/contracts";
import {
  type ClaimProviderIntent,
  ClaimProviderIntentSchema,
  type CompleteProviderIntent,
  CompleteProviderIntentSchema,
  EmptyInputSchema,
  FailProviderIntentSchema,
  FinishProviderDisconnectSchema,
  IdInputSchema,
  ProviderIntentClaimSchema,
  ProviderIntentSavedSchema,
  ProviderIntentStateSchema,
  ProviderLinkSecretSchema,
  type SaveProviderIntent,
  SaveProviderIntentSchema,
  type UpdateProviderLink,
  UpdateProviderLinkSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { wireValue } from "../../serialization";
import { ProviderLinkRepository } from "./provider-link.repository";

@Router({ alias: "providerLinks" })
export class ProviderLinkRpc {
  constructor(private readonly repository: ProviderLinkRepository) {}

  @Query({
    input: EmptyInputSchema,
    output: BankingConnectionsSchema,
    meta: { context: "user" },
  })
  list() {
    return this.repository.list();
  }

  @Query({
    input: IdInputSchema,
    output: ProviderLinkSecretSchema,
    meta: { context: "user" },
  })
  connection(@Input() input: { id: string }) {
    return this.repository.connection(input.id);
  }

  @Mutation({
    input: SaveProviderIntentSchema,
    output: ProviderIntentSavedSchema,
    meta: { context: "user" },
  })
  async createIntent(@Input() input: SaveProviderIntent) {
    return wireValue(await this.repository.createIntent(input));
  }

  @Mutation({
    input: ClaimProviderIntentSchema,
    output: ProviderIntentClaimSchema,
    meta: { context: "user" },
  })
  claim(@Input() input: ClaimProviderIntent) {
    return this.repository.claim(input);
  }

  @Mutation({
    input: CompleteProviderIntentSchema,
    output: BankingConnectionSchema,
    meta: { context: "user" },
  })
  complete(@Input() input: CompleteProviderIntent) {
    return this.repository.complete(input);
  }

  @Mutation({
    input: FailProviderIntentSchema,
    output: ProviderIntentStateSchema,
    meta: { context: "user" },
  })
  fail(@Input() input: { id: string; exchangeTokenHash: string }) {
    return this.repository.fail(input);
  }

  @Mutation({
    input: UpdateProviderLinkSchema,
    output: BankingConnectionSchema,
    meta: { context: "user" },
  })
  status(@Input() input: UpdateProviderLink) {
    return this.repository.status(input);
  }

  @Mutation({
    input: IdInputSchema,
    output: ProviderLinkSecretSchema,
    meta: { context: "user" },
  })
  beginDisconnect(@Input() input: { id: string }) {
    return this.repository.beginDisconnect(input.id);
  }

  @Mutation({
    input: FinishProviderDisconnectSchema,
    output: BankingConnectionSchema,
    meta: { context: "user" },
  })
  finishDisconnect(@Input() input: { id: string; expectedVersion: number }) {
    return this.repository.finishDisconnect(input);
  }
}
