import {
  EmptyInputSchema,
  ObjectiveIdsInputSchema,
  ObjectiveRecordsSchema,
  ObjectiveTagRecordsSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Query, Router } from "nestjs-trpc";
import { wireValue } from "../query-period";
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
    input: ObjectiveIdsInputSchema,
    output: ObjectiveTagRecordsSchema,
    meta: { context: "user" },
  })
  tags(@Input() input: { ids: string[] }) {
    return this.repository.tags(input.ids);
  }
}
