import {
  BeginProviderSyncSchema,
  type CommitProviderSync,
  CommitProviderSyncSchema,
  EmptyInputSchema,
  ProviderReviewRecordsSchema,
  ProviderSyncFactsSchema,
  ProviderSyncOutcomeSchema,
  type ProviderSyncScope,
  ProviderSyncScopeSchema,
  ProviderSyncStateSchema,
  type RecordProviderFailure,
  RecordProviderFailureSchema,
} from "@lazyfinance/contracts/internal";
import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { wireValue } from "../query-period";
import { ProviderConnectionRepository } from "./provider-connection.repository";

@Router({ alias: "providerSync" })
export class ProviderConnectionRpc {
  constructor(
    @Inject(ProviderConnectionRepository)
    private readonly repository: ProviderConnectionRepository,
  ) {}
  @Mutation({
    input: BeginProviderSyncSchema,
    output: ProviderSyncStateSchema,
    meta: { context: "user" },
  })
  async begin(@Input() input: { connectionId: string; provider: string }) {
    return wireValue(
      await this.repository.begin(input.connectionId, input.provider),
    );
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
