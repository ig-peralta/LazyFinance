import { TagDecisionSchema, type TagRuleInput } from "@lazyfinance/contracts";
import {
  ChangedCountSchema,
  type CommitRuleDecisions,
  CommitRuleDecisionsSchema,
  EmptyInputSchema,
  IdInputSchema,
  ManualTagCommandSchema,
  type RuleCandidatesInput,
  RuleCandidatesInputSchema,
  RuleCandidatesSchema,
  TaggingFactsSchema,
  TagRuleCreateSchema,
  TagRuleRecordSchema,
  TagRuleRecordsSchema,
  TagRuleReplaceSchema,
} from "@lazyfinance/contracts/internal";
import { Input, Mutation, Query, Router } from "nestjs-trpc";
import { wireValue } from "../../serialization";
import { TagRuleRepository } from "./tag-rule.repository";

@Router({ alias: "tagRules" })
export class TagRuleRpc {
  constructor(private readonly repository: TagRuleRepository) {}

  @Query({
    input: EmptyInputSchema,
    output: TagRuleRecordsSchema,
    meta: { context: "user" },
  })
  async list() {
    return wireValue(await this.repository.list());
  }

  @Mutation({
    input: TagRuleCreateSchema,
    output: TagRuleRecordSchema,
    meta: { context: "user" },
  })
  async create(@Input() input: TagRuleInput) {
    return wireValue(await this.repository.create(input));
  }

  @Mutation({
    input: TagRuleReplaceSchema,
    output: TagRuleRecordSchema,
    meta: { context: "user" },
  })
  async replace(@Input() input: { id: string; rule: TagRuleInput }) {
    return wireValue(await this.repository.replace(input.id, input.rule));
  }

  @Mutation({
    input: IdInputSchema,
    output: TagRuleRecordSchema,
    meta: { context: "user" },
  })
  async archive(@Input() input: { id: string }) {
    return wireValue(await this.repository.archive(input.id));
  }

  @Query({
    input: IdInputSchema,
    output: TaggingFactsSchema,
    meta: { context: "user", snapshot: true },
  })
  async facts(@Input() input: { id: string }) {
    return wireValue(await this.repository.facts(input.id));
  }

  @Mutation({
    input: ManualTagCommandSchema,
    output: TagDecisionSchema,
    meta: { context: "user" },
  })
  manual(@Input() input: { transactionId: string; tagId: string | null }) {
    return this.repository.manual(input.transactionId, input.tagId);
  }

  @Mutation({
    input: IdInputSchema,
    output: TagDecisionSchema,
    meta: { context: "user" },
  })
  reset(@Input() input: { id: string }) {
    return this.repository.reset(input.id);
  }

  @Query({
    input: RuleCandidatesInputSchema,
    output: RuleCandidatesSchema,
    meta: { context: "user", snapshot: true },
  })
  async candidates(@Input() input: RuleCandidatesInput) {
    return wireValue(await this.repository.candidates(input));
  }

  @Mutation({
    input: CommitRuleDecisionsSchema,
    output: ChangedCountSchema,
    meta: { context: "user" },
  })
  commit(@Input() input: CommitRuleDecisions) {
    return this.repository.commit(input);
  }
}
