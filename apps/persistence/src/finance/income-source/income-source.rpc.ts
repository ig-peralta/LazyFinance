import type { IncomeSourceInput } from "@lazyfinance/contracts";
import {
  AtIdInputSchema,
  EmptyInputSchema,
  ExpectedIncomeFactsSchema,
  IdInputSchema,
  IncomeFactsSchema,
  IncomeSourceCreateSchema,
  IncomeSourceRecordSchema,
  IncomeSourceRecordsSchema,
  IncomeSourceUpdateSchema,
  type PeriodInput,
  PeriodInputSchema,
  ReceiptFactsSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { wireValue } from "../query-period";
import { TransactionRepository } from "../transaction/transaction.repository";
import { IncomeSourceRepository } from "./income-source.repository";

@Router({ alias: "income" })
export class IncomeSourceRpc {
  constructor(
    private readonly repository: IncomeSourceRepository,
    private readonly transactions: TransactionRepository,
  ) {}

  @Query({
    input: EmptyInputSchema,
    output: IncomeSourceRecordsSchema,
    meta: { context: "user" },
  })
  async sources() {
    return wireValue(await this.repository.sources());
  }

  @Query({
    input: IdInputSchema,
    output: IncomeSourceRecordSchema,
    meta: { context: "user" },
  })
  async source(@Input() input: { id: string }) {
    return wireValue(await this.repository.source(input.id));
  }

  @Mutation({
    input: IncomeSourceCreateSchema,
    output: IncomeSourceRecordSchema,
    meta: { context: "user" },
  })
  async createSource(@Input() input: IncomeSourceInput) {
    return wireValue(await this.repository.create(input));
  }

  @Mutation({
    input: IncomeSourceUpdateSchema,
    output: IncomeSourceRecordSchema,
    meta: { context: "user" },
  })
  async updateSource(
    @Input() input: { id: string; source: IncomeSourceInput },
  ) {
    return wireValue(await this.repository.update(input.id, input.source));
  }

  @Mutation({
    input: AtIdInputSchema,
    output: IncomeSourceRecordSchema,
    meta: { context: "user" },
  })
  async archiveSource(@Input() input: { id: string; at: string }) {
    return wireValue(await this.repository.archive(input.id, input.at));
  }

  @Query({
    input: PeriodInputSchema,
    output: ExpectedIncomeFactsSchema,
    meta: { context: "user", snapshot: true },
  })
  async expectedFacts(@Input() period: PeriodInput) {
    const [sources, expectations] = await Promise.all([
      this.repository.sources(),
      this.repository.expectations(period),
    ]);
    return wireValue({ sources, expectations });
  }

  @Query({
    input: PeriodInputSchema,
    output: ReceiptFactsSchema,
    meta: { context: "user" },
  })
  async receipts(@Input() period: PeriodInput) {
    return wireValue(await this.repository.receipts(period));
  }

  @Query({
    input: PeriodInputSchema,
    output: IncomeFactsSchema,
    meta: { context: "user", snapshot: true },
  })
  async facts(@Input() period: PeriodInput) {
    const [sources, expectations, receipts, aggregates] = await Promise.all([
      this.repository.sources(),
      this.repository.expectations(period),
      this.repository.receipts(period),
      this.transactions.aggregates(period),
    ]);
    return wireValue({ sources, expectations, receipts, aggregates });
  }
}
