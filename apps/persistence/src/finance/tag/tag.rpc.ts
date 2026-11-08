import {
  type TagCreateInput,
  type UpdateTag,
  UpdateTagSchema,
} from "@lazyfinance/contracts";
import {
  EmptyInputSchema,
  IdInputSchema,
  TagCreateSchema,
  TagRecordSchema,
  TagRecordsSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { TagRepository } from "./tag.repository";

@Router({ alias: "tags" })
export class TagRpc {
  constructor(private readonly repository: TagRepository) {}

  @Mutation({
    input: UpdateTagSchema,
    output: TagRecordSchema,
    meta: { context: "user" },
  })
  update(@Input() input: UpdateTag) {
    return this.repository.update(input);
  }

  @Mutation({
    input: IdInputSchema,
    output: TagRecordSchema,
    meta: { context: "user" },
  })
  archive(@Input() input: { id: string }) {
    return this.repository.archive(input.id);
  }

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
