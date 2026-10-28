import {
  ManualTagDecisionInputSchema, TagCreateInputSchema, TagRuleInputSchema,
  type TagRuleInput,
} from '@lazyfinance/contracts';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, getTableColumns, gt, isNull, or } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { z } from 'zod';
import { DRIZZLE_PG_CLIENT } from '../../drizzle/drizzle.tokens';
import * as schema from '../../drizzle/schema';
import { account } from '../../drizzle/schema/account.table';
import { tagDecisionEvent } from '../../drizzle/schema/tag-decision-event.table';
import { tagRule, type TagRuleRow } from '../../drizzle/schema/tag-rule.table';
import { tag } from '../../drizzle/schema/tag.table';
import { transaction, type TransactionRow } from '../../drizzle/schema/transaction.table';

type Database = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type RuleWithTag = TagRuleRow & { tagName: string };

function parse<T>(contract: z.ZodType<T>, value: unknown): T {
  const result = contract.safeParse(value);
  if (!result.success) throw new BadRequestException({ message: 'Invalid tag input', issues: result.error.issues });
  return result.data;
}

function matchKey(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CL');
}

@Injectable()
export class TaggingService {
  constructor(@Inject(DRIZZLE_PG_CLIENT) private readonly db: Database) {}

  listTagsForUser(userId: string) {
    return this.db.select({ id: tag.id, name: tag.name, color: tag.color }).from(tag)
      .where(and(eq(tag.userId, userId), eq(tag.isArchived, false))).orderBy(asc(tag.name), asc(tag.id));
  }

  async createTagForUser(userId: string, value: unknown) {
    const input = parse(TagCreateInputSchema, value);
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(tag).values({ ...input, userId })
        .onConflictDoNothing().returning({ id: tag.id, name: tag.name, color: tag.color });
      if (created) return created;
      const [existing] = await tx.select({ id: tag.id, name: tag.name, color: tag.color }).from(tag)
        .where(and(eq(tag.userId, userId), eq(tag.name, input.name)));
      return existing;
    });
  }

  async assignManualTagForUser(userId: string, transactionId: string, value: unknown) {
    const { tagId } = parse(ManualTagDecisionInputSchema, value);
    return this.db.transaction(async (tx) => {
      const movement = await this.ownedMovement(tx, userId, transactionId);
      if (tagId !== null) await this.ownedTag(tx, userId, tagId);
      if (movement.tagDecisionOrigin === 'manual' && movement.tagId === tagId) return this.decision(movement);
      const [saved] = await tx.update(transaction).set({
        tagId, tagDecisionOrigin: 'manual', tagRuleId: null, tagDecidedAt: new Date(),
      }).where(eq(transaction.id, movement.id)).returning();
      await this.audit(tx, userId, movement, tagId, tagId === null ? 'manual_no_tag' : 'manual_tag');
      return this.decision(saved);
    });
  }

  async resetTagDecisionForUser(userId: string, transactionId: string) {
    return this.db.transaction(async (tx) => {
      const movement = await this.ownedMovement(tx, userId, transactionId);
      if (movement.tagDecisionOrigin === 'unreviewed') return this.decision(movement);
      const [saved] = await tx.update(transaction).set({
        tagId: null, tagDecisionOrigin: 'unreviewed', tagRuleId: null, tagDecidedAt: null,
      }).where(eq(transaction.id, movement.id)).returning();
      await this.audit(tx, userId, movement, null, 'reset');
      return this.decision(saved);
    });
  }

  listRulesForUser(userId: string) {
    return this.db.select().from(tagRule).where(eq(tagRule.userId, userId))
      .orderBy(asc(tagRule.createdAt), asc(tagRule.id));
  }

  async createRuleForUser(userId: string, value: unknown) {
    const input = parse(TagRuleInputSchema, value);
    return this.db.transaction(async (tx) => {
      await this.validateRuleTargets(tx, userId, input);
      const normalized = matchKey(input.matchValue);
      if (!normalized || normalized.length > 240) throw new BadRequestException('Invalid normalized rule value');
      const existingRules = await tx.select().from(tagRule).where(and(
        eq(tagRule.userId, userId), eq(tagRule.tagId, input.tagId), eq(tagRule.direction, input.direction),
        eq(tagRule.matchField, input.matchField), eq(tagRule.matchValue, normalized), eq(tagRule.active, true),
      ));
      const existing = existingRules.find((rule) => rule.accountId === input.accountId);
      if (existing) {
        if (input.autoApply && existing.mode === 'suggest') {
          const [approved] = await tx.update(tagRule).set({ mode: 'auto', approvedAt: new Date() })
            .where(eq(tagRule.id, existing.id)).returning();
          return approved;
        }
        return existing;
      }
      const [created] = await tx.insert(tagRule).values({
        userId, tagId: input.tagId, accountId: input.accountId, direction: input.direction,
        matchField: input.matchField, matchValue: normalized, priority: input.priority,
        mode: input.autoApply ? 'auto' : 'suggest', approvedAt: input.autoApply ? new Date() : null,
      }).onConflictDoNothing().returning();
      if (created) return created;
      const concurrentRules = await tx.select().from(tagRule).where(and(
        eq(tagRule.userId, userId), eq(tagRule.tagId, input.tagId), eq(tagRule.direction, input.direction),
        eq(tagRule.matchField, input.matchField), eq(tagRule.matchValue, normalized), eq(tagRule.active, true),
      ));
      const concurrent = concurrentRules.find((rule) => rule.accountId === input.accountId);
      if (!concurrent) throw new BadRequestException('Tag rule could not be created');
      if (input.autoApply && concurrent.mode === 'suggest') {
        const [approved] = await tx.update(tagRule).set({ mode: 'auto', approvedAt: new Date() })
          .where(eq(tagRule.id, concurrent.id)).returning();
        return approved;
      }
      return concurrent;
    });
  }

  async replaceRuleForUser(userId: string, id: string, value: unknown) {
    const input = parse(TagRuleInputSchema, value);
    return this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(tagRule).where(and(eq(tagRule.id, id), eq(tagRule.userId, userId))).for('update');
      if (!existing) throw new NotFoundException('Tag rule not found');
      await this.validateRuleTargets(tx, userId, input);
      const normalized = matchKey(input.matchValue);
      if (!normalized || normalized.length > 240) throw new BadRequestException('Invalid normalized rule value');
      const [saved] = await tx.update(tagRule).set({
        tagId: input.tagId, accountId: input.accountId, direction: input.direction,
        matchField: input.matchField, matchValue: normalized, priority: input.priority,
        mode: input.autoApply ? 'auto' : 'suggest', approvedAt: input.autoApply ? new Date() : null,
      }).where(eq(tagRule.id, id)).returning();
      return saved;
    });
  }

  async archiveRuleForUser(userId: string, id: string) {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(tagRule).where(and(eq(tagRule.id, id), eq(tagRule.userId, userId))).for('update');
      if (!existing) throw new NotFoundException('Tag rule not found');
      if (!existing.active) return existing;
      const [archived] = await tx.update(tagRule).set({ active: false }).where(eq(tagRule.id, id)).returning();
      return archived;
    });
  }

  /** Explicit, bounded backfill for an already-approved automatic rule. */
  async applyApprovedRuleToExistingForUser(userId: string, id: string, after?: string) {
    if (after !== undefined && !z.uuid().safeParse(after).success) throw new BadRequestException('Invalid rule cursor');
    return this.db.transaction(async (tx) => {
      const [rule] = await tx.select().from(tagRule).where(and(eq(tagRule.id, id), eq(tagRule.userId, userId)));
      if (!rule) throw new NotFoundException('Tag rule not found');
      if (!rule.active || rule.mode !== 'auto' || rule.approvedAt === null) {
        throw new BadRequestException('Approve an active automatic rule before applying it');
      }
      const rows = await tx.select(getTableColumns(transaction)).from(transaction)
        .innerJoin(account, eq(account.id, transaction.accountId))
        .where(and(eq(account.userId, userId), eq(transaction.type, rule.direction),
          eq(transaction.reviewStatus, 'clear'), isNull(transaction.removedAt),
          or(eq(transaction.tagDecisionOrigin, 'unreviewed'), eq(transaction.tagRuleId, rule.id)),
          after ? gt(transaction.id, after) : undefined))
        .orderBy(asc(transaction.id)).limit(1001);
      const batch = rows.slice(0, 1000);
      let changed = 0;
      for (const row of batch) {
        if (rule.accountId !== null && rule.accountId !== row.accountId) continue;
        if (matchKey(rule.matchField === 'merchant' ? row.merchant ?? '' : row.description ?? '') !== rule.matchValue) continue;
        if (await this.applyForImportedMovement(tx, userId, row)) changed++;
      }
      return { changed, nextCursor: rows.length > 1000 ? batch.at(-1)!.id : null };
    });
  }

  async suggestionsForUser(userId: string, transactionId: string) {
    const [row] = await this.db.select({ movement: getTableColumns(transaction), accountId: account.id })
      .from(transaction).innerJoin(account, eq(transaction.accountId, account.id))
      .where(and(eq(transaction.id, transactionId), eq(account.userId, userId)));
    if (!row) throw new NotFoundException('Transaction not found');
    if (row.movement.tagDecisionOrigin === 'manual' || row.movement.removedAt !== null) return [];
    return (await this.matches(this.db, userId, row.movement)).map((rule) => ({
      ruleId: rule.id, tagId: rule.tagId, tagName: rule.tagName,
      confidence: rule.matchField === 'merchant' ? 'high' as const : 'medium' as const,
      reason: `${rule.matchField}_exact`,
      autoApply: rule.mode === 'auto' && rule.approvedAt !== null &&
        row.movement.isInternalMovement === false && row.movement.reviewStatus === 'clear',
    }));
  }

  loadActiveRulesForUser(db: Pick<Database, 'select'>, userId: string): Promise<RuleWithTag[]> {
    return db.select({ ...getTableColumns(tagRule), tagName: tag.name }).from(tagRule)
      .innerJoin(tag, and(eq(tag.id, tagRule.tagId), eq(tag.userId, userId), eq(tag.isArchived, false)))
      .where(and(eq(tagRule.userId, userId), eq(tagRule.active, true)));
  }

  /** Apply only previously approved, high-confidence rules. Manual choices always win. */
  async applyForImportedMovement(tx: Tx, userId: string, movement: TransactionRow,
    cachedRules?: RuleWithTag[]): Promise<boolean> {
    if (movement.tagDecisionOrigin === 'manual' || movement.removedAt !== null) return false;
    const matches = await this.matches(tx, userId, movement, cachedRules);
    const best = matches[0];
    const sameRank = best && matches.filter((rule) => rule.priority === best.priority &&
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
    await this.audit(tx, userId, movement, tagId,
      movement.tagDecisionOrigin === 'rule' ? 'rule_revalidated' : 'rule_applied', eligible?.id ?? movement.tagRuleId);
    return true;
  }

  private async matches(db: Pick<Database, 'select'>, userId: string, movement: TransactionRow,
    cachedRules?: RuleWithTag[]): Promise<RuleWithTag[]> {
    const rules = cachedRules ?? await this.loadActiveRulesForUser(db, userId);
    return rules.filter((rule) => rule.direction === movement.type &&
      (rule.accountId === null || rule.accountId === movement.accountId) &&
      matchKey(rule.matchField === 'merchant' ? movement.merchant ?? '' : movement.description ?? '') === rule.matchValue)
      .sort((left, right) => right.priority - left.priority || Number(right.accountId !== null) - Number(left.accountId !== null) ||
        left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id));
  }

  private async validateRuleTargets(tx: Tx, userId: string, input: TagRuleInput) {
    await this.ownedTag(tx, userId, input.tagId);
    if (input.accountId !== null) {
      const [owned] = await tx.select({ id: account.id }).from(account)
        .where(and(eq(account.id, input.accountId), eq(account.userId, userId)));
      if (!owned) throw new NotFoundException('Account not found');
    }
  }

  private async ownedTag(tx: Tx, userId: string, tagId: string) {
    const [owned] = await tx.select({ id: tag.id }).from(tag)
      .where(and(eq(tag.id, tagId), eq(tag.userId, userId), eq(tag.isArchived, false)));
    if (!owned) throw new NotFoundException('Tag not found');
  }

  private async ownedMovement(tx: Tx, userId: string, transactionId: string): Promise<TransactionRow> {
    const [row] = await tx.select(getTableColumns(transaction)).from(transaction)
      .innerJoin(account, eq(account.id, transaction.accountId))
      .where(and(eq(transaction.id, transactionId), eq(account.userId, userId))).for('update');
    if (!row) throw new NotFoundException('Transaction not found');
    return row;
  }

  private async audit(tx: Tx, userId: string, previous: TransactionRow, tagId: string | null,
    kind: 'manual_tag' | 'manual_no_tag' | 'reset' | 'rule_applied' | 'rule_revalidated', ruleId: string | null = null) {
    await tx.insert(tagDecisionEvent).values({
      userId, transactionId: previous.id, previousTagId: previous.tagId, tagId, ruleId, kind,
    });
  }

  private decision(row: TransactionRow) {
    return { transactionId: row.id, tagId: row.tagId, origin: row.tagDecisionOrigin,
      ruleId: row.tagRuleId, decidedAt: row.tagDecidedAt?.toISOString() ?? null };
  }
}
