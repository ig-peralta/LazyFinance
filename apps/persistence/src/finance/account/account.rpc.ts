import {
  AccountListItemSchema,
  type SetAccountAlias,
  SetAccountAliasSchema,
} from "@lazyfinance/contracts";
import {
  AccountRecordsSchema,
  EmptyInputSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { AccountService } from "./account.service";

@Router({ alias: "accounts" })
export class AccountRpc {
  constructor(private readonly service: AccountService) {}

  @Query({
    input: EmptyInputSchema,
    output: AccountRecordsSchema,
    meta: { context: "user" },
  })
  listActive() {
    return this.service.listActive();
  }

  @Mutation({
    input: SetAccountAliasSchema,
    output: AccountListItemSchema,
    meta: { context: "user" },
  })
  setAlias(@Input() input: SetAccountAlias) {
    return this.service.setAlias(input);
  }
}
