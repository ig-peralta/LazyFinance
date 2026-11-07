import {
  EmptyInputSchema,
  MovementAggregatesSchema,
  type PeriodInput,
  PeriodInputSchema,
  RecentTransactionRecordsSchema,
  TaggedMovementAggregatesSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Query, Router } from "nestjs-trpc";
import { wireValue } from "../../serialization";
import { TransactionRepository } from "./transaction.repository";

@Router({ alias: "transactions" })
export class TransactionRpc {
  constructor(private readonly repository: TransactionRepository) {}

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
    output: TaggedMovementAggregatesSchema,
    meta: { context: "user" },
  })
  taggedAggregates(@Input() period: PeriodInput) {
    return this.repository.taggedAggregates(period);
  }
}
