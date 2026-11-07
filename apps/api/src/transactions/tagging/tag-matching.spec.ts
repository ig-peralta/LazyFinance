import type { MatchingRule } from "@lazyfinance/contracts/internal";
import { describe, expect, it } from "vitest";
import {
  createRuleMatcher,
  matchKey,
  type TaggableMovement,
} from "./tag-matching";

function rule(update: Partial<MatchingRule> = {}): MatchingRule {
  return {
    id: "rule",
    userId: "owner",
    tagId: "food",
    tagName: "Food",
    accountId: null,
    direction: "debit",
    matchField: "merchant",
    matchValue: "café central",
    priority: 10,
    mode: "auto",
    approvedAt: "2026-01-01T00:00:00Z",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...update,
  };
}

function movement(update: Partial<TaggableMovement> = {}): TaggableMovement {
  return {
    accountId: "account",
    type: "debit",
    merchant: "  ＣＡＦÉ\t CENTRAL ",
    description: "Purchase",
    tagDecisionOrigin: "unreviewed",
    tagId: null,
    tagRuleId: null,
    removedAt: null,
    reviewStatus: "clear",
    isInternalMovement: false,
    ...update,
  };
}

describe("snapshot-indexed tag matching", () => {
  it("normalizes Unicode, whitespace and locale before exact matching", () => {
    expect(matchKey(movement().merchant ?? "")).toBe("café central");
    const matcher = createRuleMatcher([
      rule(),
      rule({ id: "wrong-account", accountId: "other" }),
      rule({ id: "wrong-direction", direction: "credit" }),
      rule({ id: "wrong-key", matchValue: "different" }),
    ]);
    expect(matcher.matchingRules(movement()).map(({ id }) => id)).toEqual([
      "rule",
    ]);
    expect(matcher.automaticDecision(movement())).toEqual({
      tagId: "food",
      ruleId: "rule",
    });
  });

  it("merges merchant/description and global/account rules in the original deterministic priority order", () => {
    const rules = [
      rule({ id: "global" }),
      rule({
        id: "scoped-new",
        accountId: "account",
        createdAt: "2026-02-01T00:00:00Z",
      }),
      rule({ id: "scoped-b", accountId: "account" }),
      rule({
        id: "description",
        matchField: "description",
        matchValue: "purchase",
        priority: 20,
      }),
      rule({ id: "scoped-a", accountId: "account" }),
    ];
    const matcher = createRuleMatcher(rules);
    expect(matcher.matchingRules(movement()).map(({ id }) => id)).toEqual([
      "description",
      "scoped-a",
      "scoped-b",
      "scoped-new",
      "global",
    ]);
    expect(rules[0].id).toBe("global");
    expect(
      matcher
        .matchingRules(movement({ accountId: "different", description: null }))
        .map(({ id }) => id),
    ).toEqual(["global"]);
  });

  it("does not auto-apply ambiguous top-priority tags and invalidates a prior rule decision", () => {
    const matcher = createRuleMatcher([
      rule(),
      rule({ id: "conflict", tagId: "other" }),
    ]);
    expect(matcher.automaticDecision(movement())).toBeUndefined();
    expect(
      matcher.automaticDecision(
        movement({
          tagDecisionOrigin: "rule",
          tagId: "food",
          tagRuleId: "rule",
        }),
      ),
    ).toEqual({ tagId: null, ruleId: null });
  });

  it("preserves manual/removed decisions and declines reviewed, internal, unapproved or description-only automation", () => {
    const matcher = createRuleMatcher([rule()]);
    for (const update of [
      { tagDecisionOrigin: "manual" as const },
      { removedAt: "2026-01-01T00:00:00Z" },
      { reviewStatus: "needs_review" as const },
      { isInternalMovement: true },
      { isInternalMovement: null },
    ])
      expect(matcher.automaticDecision(movement(update))).toBeUndefined();
    expect(
      matcher.automaticDecision(
        movement({
          tagDecisionOrigin: "rule",
          tagId: "food",
          tagRuleId: "rule",
        }),
      ),
    ).toBeUndefined();
    for (const candidate of [
      rule({ approvedAt: null }),
      rule({ mode: "suggest" }),
      rule({ matchField: "description", matchValue: "purchase" }),
    ])
      expect(
        createRuleMatcher([candidate]).automaticDecision(movement()),
      ).toBeUndefined();
  });
});
