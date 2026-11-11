import {
  BankingSelectionSchema,
  RpcIdSchema,
  type SelectBankingAccounts,
  SelectBankingAccountsSchema,
} from "@lazyfinance/contracts";
import {
  type DeferProviderDiscovery,
  DeferProviderDiscoverySchema,
  ProviderTrackingSchema,
  type SaveProviderDiscovery,
  SaveProviderDiscoverySchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { ProviderSelectionRepository } from "./provider-selection.repository";

@Router({ alias: "providerSelection" })
export class ProviderSelectionRpc {
  constructor(private readonly repository: ProviderSelectionRepository) {}

  @Query({
    input: RpcIdSchema,
    output: ProviderTrackingSchema,
    meta: { context: "user", snapshot: true },
  })
  get(@Input() input: { id: string }) {
    return this.repository.tracking(input.id);
  }

  @Mutation({
    input: SaveProviderDiscoverySchema,
    output: BankingSelectionSchema,
    meta: { context: "user" },
  })
  discover(@Input() input: SaveProviderDiscovery) {
    return this.repository.discover(input);
  }

  @Mutation({
    input: SelectBankingAccountsSchema,
    output: BankingSelectionSchema,
    meta: { context: "user" },
  })
  select(@Input() input: SelectBankingAccounts) {
    return this.repository.select(input);
  }

  @Mutation({
    input: DeferProviderDiscoverySchema,
    output: BankingSelectionSchema,
    meta: { context: "user" },
  })
  deferDiscovery(@Input() input: DeferProviderDiscovery) {
    return this.repository.deferDiscovery(input);
  }
}
