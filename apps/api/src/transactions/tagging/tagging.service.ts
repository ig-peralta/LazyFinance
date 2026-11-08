import {
  ManualTagDecisionInputSchema,
  TagCreateInputSchema,
  type TagRuleInput,
  TagRuleInputSchema,
  UpdateTagSchema,
} from "@lazyfinance/contracts";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import { PersistenceClient } from "../../persistence/persistence.client";
import { persistenceException } from "../../rpc/persistence-error";
import { parseInput } from "../../validation/parse-input";
import { createRuleMatcher, matchKey } from "./tag-matching";

function normalizedRule(value: unknown): TagRuleInput {
  const input = parseInput(TagRuleInputSchema, value, "Invalid tag input");
  const matchValue = matchKey(input.matchValue);
  if (!matchValue || matchValue.length > 240)
    throw new BadRequestException("Invalid normalized rule value");

  return { ...input, matchValue };
}

@Injectable()
export class TaggingService {
  constructor(private readonly persistence: PersistenceClient) {}

  async listTagsForUser(userId: string) {
    return (await this.persistence.user(userId).tags.list.query())
      .filter((row) => !row.isArchived)
      .map(({ isArchived: _, ...row }) => row);
  }

  async createTagForUser(userId: string, value: unknown) {
    const { isArchived: _, ...tag } = await this.persistence
      .user(userId)
      .tags.create.mutate(
        parseInput(TagCreateInputSchema, value, "Invalid tag input"),
      );
    return tag;
  }

  updateTagForUser(userId: string, value: unknown) {
    return this.persistence
      .user(userId)
      .tags.update.mutate(
        parseInput(UpdateTagSchema, value, "Invalid tag input"),
      );
  }

  archiveTagForUser(userId: string, id: string) {
    return this.persistence.user(userId).tags.archive.mutate({ id });
  }

  async assignManualTagForUser(
    userId: string,
    transactionId: string,
    value: unknown,
  ) {
    return this.persistence.user(userId).tagRules.manual.mutate({
      transactionId,
      ...parseInput(ManualTagDecisionInputSchema, value, "Invalid tag input"),
    });
  }

  resetTagDecisionForUser(userId: string, id: string) {
    return this.persistence.user(userId).tagRules.reset.mutate({ id });
  }

  listRulesForUser(userId: string) {
    return this.persistence.user(userId).tagRules.list.query();
  }

  async createRuleForUser(userId: string, value: unknown) {
    return this.persistence
      .user(userId)
      .tagRules.create.mutate(normalizedRule(value));
  }

  async replaceRuleForUser(userId: string, id: string, value: unknown) {
    return this.persistence
      .user(userId)
      .tagRules.replace.mutate({ id, rule: normalizedRule(value) });
  }

  archiveRuleForUser(userId: string, id: string) {
    return this.persistence.user(userId).tagRules.archive.mutate({ id });
  }

  async applyApprovedRuleToExistingForUser(
    userId: string,
    ruleId: string,
    after?: string,
  ) {
    if (after !== undefined && !z.uuid().safeParse(after).success)
      throw new BadRequestException("Invalid rule cursor");

    const client = this.persistence.user(userId);

    for (let attempt = 0; ; attempt++) {
      const facts = await client.tagRules.candidates.query({ ruleId, after });
      const matcher = createRuleMatcher(facts.rules);
      const batch = facts.movements.slice(0, 1000);
      const decisions = batch.flatMap((row) => {
        if (
          facts.rule.accountId !== null &&
          facts.rule.accountId !== row.accountId
        )
          return [];
        if (
          matchKey(
            facts.rule.matchField === "merchant"
              ? (row.merchant ?? "")
              : (row.description ?? ""),
          ) !== facts.rule.matchValue
        )
          return [];

        const decision = matcher.automaticDecision(row);

        return decision ? [{ transactionId: row.id, ...decision }] : [];
      });

      try {
        const result = await client.tagRules.commit.mutate({
          ruleId,
          after,
          expectedFingerprint: facts.fingerprint,
          decisions,
        });
        return {
          ...result,
          nextCursor: facts.movements.length > 1000 ? batch.at(-1)!.id : null,
        };
      } catch (error) {
        // Only a known pre-write stale-input rejection is safe to recompute/retry.
        if (persistenceException(error)?.getStatus() !== 409 || attempt >= 2)
          throw error;
      }
    }
  }

  async suggestionsForUser(userId: string, id: string) {
    const { movement, rules } = await this.persistence
      .user(userId)
      .tagRules.facts.query({ id });
    if (movement.tagDecisionOrigin === "manual" || movement.removedAt !== null)
      return [];

    return createRuleMatcher(rules)
      .matchingRules(movement)
      .map((rule) => ({
        ruleId: rule.id,
        tagId: rule.tagId,
        tagName: rule.tagName,
        confidence:
          rule.matchField === "merchant"
            ? ("high" as const)
            : ("medium" as const),
        reason: `${rule.matchField}_exact`,
        autoApply:
          rule.mode === "auto" &&
          rule.approvedAt !== null &&
          movement.isInternalMovement === false &&
          movement.reviewStatus === "clear",
      }));
  }
}
