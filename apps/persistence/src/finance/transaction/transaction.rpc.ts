import {
  EmptyInputSchema,
  MovementAggregatesSchema,
  type PeriodInput,
  PeriodInputSchema,
  RecentTransactionRecordsSchema,
  TaggedDebitRecordsSchema,
} from "@lazyfinance/contracts/internal";
import { Inject } from "@nestjs/common";
import { Input, Query, Router } from "nestjs-trpc";
import { wireValue } from "../query-period";
import { TransactionRepository } from "./transaction.repository";

@Router({ alias: "transactions" })
export class TransactionRpc {
  constructor(
    @Inject(TransactionRepository)
    private readonly repository: TransactionRepository,
  ) {}

  @Query({
    input: EmptyInputSchema,
    output: RecentTransactionRecordsSchema,
    meta: { context: "user" },
  })
  async recent() {
    const rows = await this.repository.recent();
    return wireValue(
      rows.map(({ joinedTagId, tagName, tagColor, ...row }) => ({
        ...row,
        tag: joinedTagId
          ? { id: joinedTagId, name: tagName!, color: tagColor }
          : null,
      })),
    );
  }

  @Query({
    input: PeriodInputSchema,
    output: MovementAggregatesSchema,
    meta: { context: "user" },
  })
  async aggregates(@Input() period: PeriodInput) {
    return this.repository.aggregates(period);
  }

  @Query({
    input: PeriodInputSchema,
    output: TaggedDebitRecordsSchema,
    meta: { context: "user" },
  })
  async taggedDebits(@Input() period: PeriodInput) {
    return wireValue(await this.repository.taggedDebits(period));
  }
}
