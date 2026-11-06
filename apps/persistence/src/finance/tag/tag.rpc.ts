import type { TagCreateInput } from "@lazyfinance/contracts";
import {
  EmptyInputSchema,
  TagCreateSchema,
  TagRecordSchema,
  TagRecordsSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { TagRepository } from "./tag.repository";

@Router({ alias: "tags" })
export class TagRpc {
  constructor(private readonly repository: TagRepository) {}

  @Query({
    input: EmptyInputSchema,
    output: TagRecordsSchema,
    meta: { context: "user" },
  })
  list() {
    return this.repository.list();
  }

  @Mutation({
    input: TagCreateSchema,
    output: TagRecordSchema,
    meta: { context: "user" },
  })
  create(@Input() input: TagCreateInput) {
    return this.repository.create(input);
  }
}
