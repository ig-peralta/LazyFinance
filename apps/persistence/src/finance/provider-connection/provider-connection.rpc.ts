import { RpcIdSchema } from "@lazyfinance/contracts";
import {
  type BeginProviderSync,
  BeginProviderSyncSchema,
  type CommitProviderSync,
  CommitProviderSyncSchema,
  EmptyInputSchema,
  ProviderReviewRecordsSchema,
  ProviderSyncBeginSchema,
  ProviderSyncFactsSchema,
  ProviderSyncOutcomeSchema,
  type ProviderSyncScope,
  ProviderSyncScopeSchema,
  ProviderSyncStatusFactsSchema,
  type RecordProviderFailure,
  RecordProviderFailureSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { wireValue } from "../../serialization";
import { ProviderConnectionRepository } from "./provider-connection.repository";

@Router({ alias: "providerSync" })
export class ProviderConnectionRpc {
  constructor(private readonly repository: ProviderConnectionRepository) {}

  @Mutation({
    input: BeginProviderSyncSchema,
    output: ProviderSyncBeginSchema,
    meta: { context: "user" },
  })
  async begin(@Input() input: BeginProviderSync) {
    return wireValue(await this.repository.begin(input));
  }

  @Query({
    input: RpcIdSchema,
    output: ProviderSyncStatusFactsSchema,
    meta: { context: "user", snapshot: true },
  })
  async status(@Input() input: { id: string }) {
    return wireValue(await this.repository.status(input.id));
  }

  @Query({
    input: ProviderSyncScopeSchema,
    output: ProviderSyncFactsSchema,
    meta: { context: "user", snapshot: true },
  })
  facts(@Input() input: ProviderSyncScope) {
    return this.repository.facts(input);
  }

  @Mutation({
    input: CommitProviderSyncSchema,
    output: ProviderSyncOutcomeSchema,
    meta: { context: "user" },
  })
  commit(@Input() input: CommitProviderSync) {
    return this.repository.commit(input);
  }

  @Mutation({
    input: RecordProviderFailureSchema,
    output: ProviderSyncOutcomeSchema,
    meta: { context: "user" },
  })
  failure(@Input() input: RecordProviderFailure) {
    return this.repository.failure(input);
  }

  @Query({
    input: EmptyInputSchema,
    output: ProviderReviewRecordsSchema,
    meta: { context: "user" },
  })
  async review() {
    return wireValue(await this.repository.review());
  }
}
