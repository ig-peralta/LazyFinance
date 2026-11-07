import {
  EmptyInputSchema,
  ObjectiveRecordsSchema,
  ObjectiveSpendingFactsSchema,
  type ObjectiveSpendingInput,
  ObjectiveSpendingInputSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Query, Router } from "nestjs-trpc";
import { wireValue } from "../../serialization";
import { ObjectiveRepository } from "./objective.repository";

@Router({ alias: "objectives" })
export class ObjectiveRpc {
  constructor(private readonly repository: ObjectiveRepository) {}

  @Query({
    input: EmptyInputSchema,
    output: ObjectiveRecordsSchema,
    meta: { context: "user" },
  })
  async list() {
    return wireValue(await this.repository.list());
  }

  @Query({
    input: ObjectiveSpendingInputSchema,
    output: ObjectiveSpendingFactsSchema,
    meta: { context: "user" },
  })
  spending(@Input() input: ObjectiveSpendingInput) {
    return this.repository.spending(input);
  }
}
