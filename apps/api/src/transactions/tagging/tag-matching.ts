import type {
  MatchingRule,
  TransactionRecord,
} from "@lazyfinance/contracts/internal";

export function matchKey(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-CL");
}

export type TaggableMovement = Pick<
  TransactionRecord,
  | "accountId"
  | "type"
  | "merchant"
  | "description"
  | "tagDecisionOrigin"
  | "tagId"
  | "tagRuleId"
  | "removedAt"
  | "reviewStatus"
  | "isInternalMovement"
>;

const ruleKey = (
  direction: string,
  field: string,
  value: string,
  accountId: string | null,
) => JSON.stringify([direction, field, value, accountId]);

/** Build once per immutable facts snapshot, not once per movement. */
export function createRuleMatcher(rules: MatchingRule[]) {
  type RankedRule = { rule: MatchingRule; rank: number };
  const index = new Map<string, RankedRule[]>();
  const ordered = [...rules].sort(
    (left, right) =>
      right.priority - left.priority ||
      Number(right.accountId !== null) - Number(left.accountId !== null) ||
      new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime() ||
      left.id.localeCompare(right.id),
  );

  ordered.forEach((rule, rank) => {
    const key = ruleKey(
      rule.direction,
      rule.matchField,
      rule.matchValue,
      rule.accountId,
    );
    const bucket = index.get(key) ?? [];
    bucket.push({ rule, rank });
    index.set(key, bucket);
  });

  function matchingRules(movement: TaggableMovement): MatchingRule[] {
    if (!index.size) return [];

    const buckets: RankedRule[][] = [];
    for (const field of ["merchant", "description"] as const) {
      const value = matchKey(movement[field] ?? "");
      for (const accountId of [null, movement.accountId]) {
        const bucket = index.get(
          ruleKey(movement.type, field, value, accountId),
        );
        if (bucket) buckets.push(bucket);
      }
    }

    // Merge at most four preordered buckets; no per-movement full scan or sort.
    const positions = buckets.map(() => 0);
    const matches: MatchingRule[] = [];
    for (;;) {
      let selected = -1;
      let rank = Number.POSITIVE_INFINITY;
      for (let i = 0; i < buckets.length; i++) {
        const next = buckets[i][positions[i]];
        if (next && next.rank < rank) {
          selected = i;
          rank = next.rank;
        }
      }
      if (selected === -1) return matches;
      matches.push(buckets[selected][positions[selected]++].rule);
    }
  }

  /** undefined preserves the existing decision; null IDs explicitly invalidate an old rule decision. */
  function automaticDecision(movement: TaggableMovement) {
    if (movement.tagDecisionOrigin === "manual" || movement.removedAt !== null)
      return undefined;

    const matches = matchingRules(movement);
    const best = matches[0];
    const ambiguous =
      best &&
      matches.some(
        (rule) =>
          rule.priority === best.priority &&
          Boolean(rule.accountId) === Boolean(best.accountId) &&
          rule.tagId !== best.tagId,
      );
    const eligible =
      movement.reviewStatus === "clear" &&
      movement.isInternalMovement === false &&
      !ambiguous &&
      best?.mode === "auto" &&
      best.approvedAt !== null &&
      best.matchField === "merchant"
        ? best
        : null;
    if (
      eligible &&
      movement.tagDecisionOrigin === "rule" &&
      movement.tagRuleId === eligible.id &&
      movement.tagId === eligible.tagId
    )
      return undefined;
    if (!eligible && movement.tagDecisionOrigin !== "rule") return undefined;

    return { tagId: eligible?.tagId ?? null, ruleId: eligible?.id ?? null };
  }

  return { matchingRules, automaticDecision };
}
