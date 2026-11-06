import type { TagCreateInput, TagRuleInput } from '@lazyfinance/contracts';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, getTableColumns, gt, isNull, or } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_PG_CLIENT } from '../drizzle.tokens';
import * as schema from '../schema';
import { account } from '../schema/account.table';
import { tagRule } from '../schema/tag-rule.table';
import { tag } from '../schema/tag.table';
import { transaction, type TransactionRow } from '../schema/transaction.table';
import { applyForImportedMovement, audit, matchKey, suggestions, type Tx } from './internal/tagging-operations';

type Database = PostgresJsDatabase<typeof schema>;

@Injectable()
export class TaggingRepository {
  constructor(@Inject(DRIZZLE_PG_CLIENT) private readonly db: Database) {}

  async listTagsForUser(userId: string) {
    return this.db.select({ id: tag.id, name: tag.name, color: tag.color }).from(tag)
      .where(and(eq(tag.userId, userId), eq(tag.isArchived, false))).orderBy(asc(tag.name), asc(tag.id));
  }

  async createTagForUser(userId: string, input: TagCreateInput) {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(tag).values({ ...input, userId })
        .onConflictDoNothing().returning({ id: tag.id, name: tag.name, color: tag.color });
      if (created) return created;
      const [existing] = await tx.select({ id: tag.id, name: tag.name, color: tag.color }).from(tag)
        .where(and(eq(tag.userId, userId), eq(tag.name, input.name)));
      return existing;
    });
  }

  async assignManualTagForUser(userId: string, transactionId: string, tagId: string | null) {
    return this.db.transaction(async (tx) => {
      const movement = await this.ownedMovement(tx, userId, transactionId);
      if (tagId !== null) await this.ownedTag(tx, userId, tagId);
      if (movement.tagDecisionOrigin === 'manual' && movement.tagId === tagId) return this.decision(movement);
      const [saved] = await tx.update(transaction).set({
        tagId, tagDecisionOrigin: 'manual', tagRuleId: null, tagDecidedAt: new Date(),
      }).where(eq(transaction.id, movement.id)).returning();
      await audit(tx, userId, movement, tagId, tagId === null ? 'manual_no_tag' : 'manual_tag');
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
      await audit(tx, userId, movement, null, 'reset');
      return this.decision(saved);
    });
  }

  async listRulesForUser(userId: string) {
    return this.db.select().from(tagRule).where(eq(tagRule.userId, userId))
      .orderBy(asc(tagRule.createdAt), asc(tagRule.id));
  }

  async createRuleForUser(userId: string, input: TagRuleInput) {
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

  async replaceRuleForUser(userId: string, id: string, input: TagRuleInput) {
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
        if (await applyForImportedMovement(tx, userId, row)) changed++;
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
    return suggestions(this.db, userId, row.movement);
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

  private decision(row: TransactionRow) {
    return { transactionId: row.id, tagId: row.tagId, origin: row.tagDecisionOrigin,
      ruleId: row.tagRuleId, decidedAt: row.tagDecidedAt?.toISOString() ?? null };
  }
}
