import {
  ManualTagDecisionInputSchema,
  TagCreateInputSchema,
  type TagRuleInput,
  TagRuleInputSchema,
} from "@lazyfinance/contracts";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import {
  PersistenceClient,
  persistenceException,
} from "../../persistence/persistence.client";
import { automaticDecision, matchingRules, matchKey } from "./tag-matching";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      message: "Invalid tag input",
      issues: result.error.issues,
    });

  return result.data;
}

function normalizedRule(value: unknown): TagRuleInput {
  const input = parse(TagRuleInputSchema, value);
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
      .tags.create.mutate(parse(TagCreateInputSchema, value));
    return tag;
  }

  async assignManualTagForUser(
    userId: string,
    transactionId: string,
    value: unknown,
  ) {
    return this.persistence.user(userId).tagRules.manual.mutate({
      transactionId,
      ...parse(ManualTagDecisionInputSchema, value),
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

        const decision = automaticDecision(row, facts.rules);

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

    return matchingRules(movement, rules).map((rule) => ({
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
