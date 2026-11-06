import {
  AccountRecordsSchema,
  EmptyInputSchema,
} from "@lazyfinance/contracts/internal";
import { Inject } from "@nestjs/common";
import { Query, Router } from "nestjs-trpc";
import { AccountService } from "./account.service";

@Router({ alias: "accounts" })
export class AccountRpc {
  constructor(
    @Inject(AccountService) private readonly service: AccountService,
  ) {}
  @Query({
    input: EmptyInputSchema,
    output: AccountRecordsSchema,
    meta: { context: "user" },
  })
  listActive() {
    return this.service.listActive();
  }
}
