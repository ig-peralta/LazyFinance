import type { IncomeExpectationInput } from "@lazyfinance/contracts";
import {
  ExpectationCreateSchema,
  ExpectationRecordSchema,
  ExpectationRecordsSchema,
  ExpectationUpdateSchema,
  IdInputSchema,
  VoidResultSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { IncomeExpectationRepository } from "./income-expectation.repository";

@Router({ alias: "incomeExpectations" })
export class IncomeExpectationRpc {
  constructor(private readonly repository: IncomeExpectationRepository) {}

  @Query({
    input: IdInputSchema,
    output: ExpectationRecordsSchema,
    meta: { context: "user" },
  })
  list(@Input() input: { id: string }) {
    return this.repository.list(input.id);
  }

  @Mutation({
    input: ExpectationCreateSchema,
    output: ExpectationRecordSchema,
    meta: { context: "user" },
  })
  create(
    @Input() input: { sourceId: string; expectation: IncomeExpectationInput },
  ) {
    return this.repository.create(input.sourceId, input.expectation);
  }

  @Mutation({
    input: ExpectationUpdateSchema,
    output: ExpectationRecordSchema,
    meta: { context: "user" },
  })
  update(@Input() input: { id: string; expectation: IncomeExpectationInput }) {
    return this.repository.update(input.id, input.expectation);
  }

  @Mutation({
    input: IdInputSchema,
    output: VoidResultSchema,
    meta: { context: "user" },
  })
  remove(@Input() input: { id: string }) {
    return this.repository.remove(input.id);
  }
}
