import { and, eq, getTableColumns } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../schema';
import { tagDecisionEvent } from '../../schema/tag-decision-event.table';
import { tagRule, type TagRuleRow } from '../../schema/tag-rule.table';
import { tag } from '../../schema/tag.table';
import { transaction, type TransactionRow } from '../../schema/transaction.table';

type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type RuleWithTag = TagRuleRow & { tagName: string };

export function matchKey(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CL');
}

export function loadActiveRulesForUser(db: Pick<Database, 'select'>, userId: string): Promise<RuleWithTag[]> {
  return db.select({ ...getTableColumns(tagRule), tagName: tag.name }).from(tagRule)
    .innerJoin(tag, and(eq(tag.id, tagRule.tagId), eq(tag.userId, userId), eq(tag.isArchived, false)))
    .where(and(eq(tagRule.userId, userId), eq(tagRule.active, true)));
}

async function matches(db: Pick<Database, 'select'>, userId: string, movement: TransactionRow,
  cachedRules?: RuleWithTag[]): Promise<RuleWithTag[]> {
  const rules = cachedRules ?? await loadActiveRulesForUser(db, userId);
  return rules.filter((rule) => rule.direction === movement.type &&
    (rule.accountId === null || rule.accountId === movement.accountId) &&
    matchKey(rule.matchField === 'merchant' ? movement.merchant ?? '' : movement.description ?? '') === rule.matchValue)
    .sort((left, right) => right.priority - left.priority || Number(right.accountId !== null) - Number(left.accountId !== null) ||
      left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id));
}

export async function suggestions(db: Pick<Database, 'select'>, userId: string, movement: TransactionRow) {
  return (await matches(db, userId, movement)).map((rule) => ({
    ruleId: rule.id, tagId: rule.tagId, tagName: rule.tagName,
    confidence: rule.matchField === 'merchant' ? 'high' as const : 'medium' as const,
    reason: `${rule.matchField}_exact`,
    autoApply: rule.mode === 'auto' && rule.approvedAt !== null &&
      movement.isInternalMovement === false && movement.reviewStatus === 'clear',
  }));
}

export async function audit(tx: Tx, userId: string, previous: TransactionRow, tagId: string | null,
  kind: 'manual_tag' | 'manual_no_tag' | 'reset' | 'rule_applied' | 'rule_revalidated', ruleId: string | null = null) {
  await tx.insert(tagDecisionEvent).values({
    userId, transactionId: previous.id, previousTagId: previous.tagId, tagId, ruleId, kind,
  });
}

/** Transaction-scoped implementation shared only by persistence operations. */
export async function applyForImportedMovement(tx: Tx, userId: string, movement: TransactionRow,
  cachedRules?: RuleWithTag[]): Promise<boolean> {
  if (movement.tagDecisionOrigin === 'manual' || movement.removedAt !== null) return false;
  const matching = await matches(tx, userId, movement, cachedRules);
  const best = matching[0];
  const sameRank = best && matching.filter((rule) => rule.priority === best.priority &&
    Boolean(rule.accountId) === Boolean(best.accountId));
  const ambiguous = sameRank && sameRank.some((rule) => rule.tagId !== best.tagId);
  const eligible = movement.reviewStatus === 'clear' && movement.isInternalMovement === false &&
    !ambiguous && best?.mode === 'auto' &&
    best.approvedAt !== null && best.matchField === 'merchant' ? best : null;

  if (eligible && movement.tagDecisionOrigin === 'rule' && movement.tagRuleId === eligible.id &&
    movement.tagId === eligible.tagId) return false;
  if (!eligible && movement.tagDecisionOrigin !== 'rule') return false;

  const tagId = eligible?.tagId ?? null;
  await tx.update(transaction).set({
    tagId, tagRuleId: eligible?.id ?? null,
    tagDecisionOrigin: eligible ? 'rule' : 'unreviewed',
    tagDecidedAt: eligible ? new Date() : null,
  }).where(eq(transaction.id, movement.id));
  await audit(tx, userId, movement, tagId,
    movement.tagDecisionOrigin === 'rule' ? 'rule_revalidated' : 'rule_applied', eligible?.id ?? movement.tagRuleId);
  return true;
}
