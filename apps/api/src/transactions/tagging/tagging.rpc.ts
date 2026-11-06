import {
  AppliedTagRuleSchema,
  ApplyTagRuleSchema,
  ReplaceTagRuleSchema,
  RpcEmptySchema,
  RpcIdSchema,
  SetTagSchema,
  SuggestionsResultSchema,
  type TagCreateInput,
  TagCreateInputSchema,
  TagDecisionSchema,
  type TagRuleInput,
  TagRuleInputSchema,
  TagRuleResultSchema,
  TagRulesResultSchema,
  TagSummarySchema,
  TagsResultSchema,
} from "@lazyfinance/contracts";
import { Ctx, Input, Mutation, Query, Router } from "nestjs-trpc";
import type { ApiRequestContext } from "../../rpc/api.context";
import { rpcUser } from "../../rpc/api.middleware";
import { TaggingService } from "./tagging.service";

@Router({ alias: "tags" })
export class TagsRpc {
  constructor(private readonly service: TaggingService) {}

  @Query({
    input: RpcEmptySchema,
    output: TagsResultSchema,
    meta: { auth: "user" },
  })
  list(@Ctx() ctx: ApiRequestContext) {
    return this.service.listTagsForUser(rpcUser(ctx));
  }

  @Mutation({
    input: TagCreateInputSchema,
    output: TagSummarySchema,
    meta: { auth: "user" },
  })
  create(@Ctx() ctx: ApiRequestContext, @Input() input: TagCreateInput) {
    return this.service.createTagForUser(rpcUser(ctx), input);
  }

  @Query({
    input: RpcIdSchema,
    output: SuggestionsResultSchema,
    meta: { auth: "user" },
  })
  suggestions(@Ctx() ctx: ApiRequestContext, @Input() input: { id: string }) {
    return this.service.suggestionsForUser(rpcUser(ctx), input.id);
  }

  @Mutation({
    input: SetTagSchema,
    output: TagDecisionSchema,
    meta: { auth: "user" },
  })
  decide(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { transactionId: string; tagId: string | null },
  ) {
    return this.service.assignManualTagForUser(
      rpcUser(ctx),
      input.transactionId,
      { tagId: input.tagId },
    );
  }

  @Mutation({
    input: RpcIdSchema,
    output: TagDecisionSchema,
    meta: { auth: "user" },
  })
  reset(@Ctx() ctx: ApiRequestContext, @Input() input: { id: string }) {
    return this.service.resetTagDecisionForUser(rpcUser(ctx), input.id);
  }
}

@Router({ alias: "tagRules" })
export class TagRulesRpc {
  constructor(private readonly service: TaggingService) {}

  @Query({
    input: RpcEmptySchema,
    output: TagRulesResultSchema,
    meta: { auth: "user" },
  })
  list(@Ctx() ctx: ApiRequestContext) {
    return this.service.listRulesForUser(rpcUser(ctx));
  }

  @Mutation({
    input: TagRuleInputSchema,
    output: TagRuleResultSchema,
    meta: { auth: "user" },
  })
  create(@Ctx() ctx: ApiRequestContext, @Input() input: TagRuleInput) {
    return this.service.createRuleForUser(rpcUser(ctx), input);
  }

  @Mutation({
    input: ReplaceTagRuleSchema,
    output: TagRuleResultSchema,
    meta: { auth: "user" },
  })
  replace(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { id: string; rule: TagRuleInput },
  ) {
    return this.service.replaceRuleForUser(rpcUser(ctx), input.id, input.rule);
  }

  @Mutation({
    input: RpcIdSchema,
    output: TagRuleResultSchema,
    meta: { auth: "user" },
  })
  archive(@Ctx() ctx: ApiRequestContext, @Input() input: { id: string }) {
    return this.service.archiveRuleForUser(rpcUser(ctx), input.id);
  }

  @Mutation({
    input: ApplyTagRuleSchema,
    output: AppliedTagRuleSchema,
    meta: { auth: "user" },
  })
  apply(
    @Ctx() ctx: ApiRequestContext,
    @Input() input: { id: string; after?: string },
  ) {
    return this.service.applyApprovedRuleToExistingForUser(
      rpcUser(ctx),
      input.id,
      input.after,
    );
  }
}
