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

export function matchingRules(
  movement: TaggableMovement,
  rules: MatchingRule[],
): MatchingRule[] {
  return rules
    .filter(
      (rule) =>
        rule.direction === movement.type &&
        (rule.accountId === null || rule.accountId === movement.accountId) &&
        matchKey(
          rule.matchField === "merchant"
            ? (movement.merchant ?? "")
            : (movement.description ?? ""),
        ) === rule.matchValue,
    )
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        Number(right.accountId !== null) - Number(left.accountId !== null) ||
        new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime() ||
        left.id.localeCompare(right.id),
    );
}

/** undefined preserves the existing decision; null IDs explicitly invalidate an old rule decision. */
export function automaticDecision(
  movement: TaggableMovement,
  rules: MatchingRule[],
) {
  if (movement.tagDecisionOrigin === "manual" || movement.removedAt !== null)
    return undefined;
  const matches = matchingRules(movement, rules);
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
