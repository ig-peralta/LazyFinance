import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { toCents } from '../../_utils/money';
import { DRIZZLE_PG_CLIENT } from '../../drizzle/drizzle.tokens';
import * as schema from '../../drizzle/schema';
import { account, type AccountRow } from '../../drizzle/schema/account.table';
import { incomeReceipt } from '../../drizzle/schema/income-receipt.table';
import { providerConnection } from '../../drizzle/schema/provider-connection.table';
import { providerMovementConflict, providerMovementConflictReasonEnum } from '../../drizzle/schema/provider-movement-conflict.table';
import { providerMovementRemoval } from '../../drizzle/schema/provider-movement-removal.table';
import { providerSyncState } from '../../drizzle/schema/provider-sync-state.table';
import { provider } from '../../drizzle/schema/provider.table';
import { transaction } from '../../drizzle/schema/transaction.table';
import { TaggingService } from '../../transactions/tagging/tagging.service';
import type { BankingConnector } from '../connector/banking-connector';
import {
  ConnectorResultSchema, type ConnectorFailure, type ConnectorPage, type NormalizedMovement,
} from '../connector/normalized-banking.schema';
import { bookingDate, movementDirection, movementKey } from './normalized-movement';

type Database = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type ConflictReason = (typeof providerMovementConflictReasonEnum.enumValues)[number];
type FailureReason = ConnectorFailure['reason'];
type SyncOutcome =
  | { status: 'complete' | 'needs_review'; conflictCount: number; checkpoint: string | null }
  | { status: 'failed'; reason: FailureReason; retryAfter: string | null }
  | { status: 'superseded' };

const MAX_PAGES = 100;
const MAX_RECORDS = 50_000;

class InvalidBatchError extends Error {}

@Injectable()
export class BankingIngestionService {
  constructor(@Inject(DRIZZLE_PG_CLIENT) private readonly db: Database, private readonly tagging: TaggingService) {}

  /** No provider payloads or credentials cross this boundary. */
  async syncForUser(userId: string, connectionId: string, connector: BankingConnector): Promise<SyncOutcome> {
    const [owned] = await this.db.select({
      status: providerConnection.status, identifier: provider.identifier,
    }).from(providerConnection).innerJoin(provider, eq(providerConnection.providerId, provider.id))
      .where(and(eq(providerConnection.id, connectionId), eq(providerConnection.userId, userId)));
    if (!owned) throw new NotFoundException('Banking connection not found');
    if (owned.identifier !== connector.provider) throw new BadRequestException('Connector does not match this connection');
    if (owned.status !== 'active') throw new BadRequestException('Banking connection needs relinking');

    const [state] = await this.db.select().from(providerSyncState)
      .where(eq(providerSyncState.providerConnectionId, connectionId));
    const checkpoint = state?.checkpoint ?? null;
    const revision = state?.revision ?? 0;
    await this.db.insert(providerSyncState).values({ providerConnectionId: connectionId, lastAttemptAt: new Date() })
      .onConflictDoUpdate({ target: providerSyncState.providerConnectionId, set: { lastAttemptAt: new Date() } });

    const fetched = await this.fetchPages(connector, connectionId, checkpoint);
    if ('failure' in fetched) return this.recordFailure(userId, connectionId, revision, fetched.failure);

    try {
      return await this.db.transaction(async (tx) => {
        const [connection] = await tx.select().from(providerConnection)
          .where(and(eq(providerConnection.id, connectionId), eq(providerConnection.userId, userId))).for('update');
        if (!connection) throw new NotFoundException('Banking connection not found');
        if (connection.status !== 'active') return { status: 'superseded' } as const;
        const [current] = await tx.select().from(providerSyncState)
          .where(eq(providerSyncState.providerConnectionId, connectionId));
        if (current.revision !== revision) return { status: 'superseded' } as const;

        const last = fetched.pages.at(-1)!;
        if (current.lastProviderObservedAt && new Date(last.observedAt) < current.lastProviderObservedAt) {
          throw new InvalidBatchError('Provider returned an older snapshot');
        }
        const conflicts = await this.apply(tx, connectionId, userId, fetched.pages);
        await tx.update(providerSyncState).set({
          checkpoint: last.checkpoint, revision: revision + 1, lastSuccessAt: new Date(),
          lastProviderObservedAt: new Date(last.observedAt),
          lastResult: conflicts ? 'needs_review' : 'complete', unresolvedConflictCount: conflicts,
          lastFailureReason: null, retryAfter: null,
        }).where(eq(providerSyncState.providerConnectionId, connectionId));
        return { status: conflicts ? 'needs_review' : 'complete', conflictCount: conflicts, checkpoint: last.checkpoint } as const;
      });
    } catch (error) {
      if (!(error instanceof InvalidBatchError)) throw error;
      return this.recordFailure(userId, connectionId, revision, {
        kind: 'failure', reason: 'invalid_data', observedAt: new Date().toISOString(), retryAfter: null,
      });
    }
  }

  async listPendingReviewForUser(userId: string) {
    return this.db.select({
      transactionId: transaction.id, accountId: account.id, reason: providerMovementConflict.reason,
      amount: transaction.amount, type: transaction.type, bookedAt: transaction.bookedAt,
      tagId: transaction.tagId, incomeSourceId: incomeReceipt.sourceId,
      previousFacts: providerMovementConflict.previousFacts, incomingFacts: providerMovementConflict.incomingFacts,
    }).from(providerMovementConflict)
      .innerJoin(transaction, eq(transaction.id, providerMovementConflict.transactionId))
      .innerJoin(account, eq(account.id, transaction.accountId))
      .leftJoin(incomeReceipt, eq(incomeReceipt.transactionId, transaction.id))
      .where(and(eq(account.userId, userId), isNull(providerMovementConflict.resolvedAt)));
  }

  private async fetchPages(connector: BankingConnector, connectionId: string, checkpoint: string | null): Promise<
    { pages: ConnectorPage[] } | { failure: ConnectorFailure }
  > {
    const pages: ConnectorPage[] = [];
    const seen = new Set<string>();
    let pageCursor: string | null = null;
    let recordCount = 0;
    for (let i = 0; i < MAX_PAGES; i++) {
      try {
        const parsed = ConnectorResultSchema.safeParse(await connector.fetchPage({ connectionId, checkpoint, pageCursor }));
        if (!parsed.success) return { failure: this.invalidData() };
        if (parsed.data.kind === 'failure') return { failure: parsed.data };
        const page = parsed.data;
        if (pages.length && new Date(page.observedAt) < new Date(pages.at(-1)!.observedAt)) {
          return { failure: this.invalidData() };
        }
        recordCount += page.accounts.length + page.movements.length + page.removedMovements.length;
        if (recordCount > MAX_RECORDS) return { failure: this.invalidData() };
        pages.push(page);
        if (page.complete) return { pages };
        if (page.nextCursor === null || seen.has(page.nextCursor)) return { failure: this.invalidData() };
        seen.add(page.nextCursor);
        pageCursor = page.nextCursor;
      } catch {
        return { failure: {
          kind: 'failure', reason: 'retryable', observedAt: new Date().toISOString(), retryAfter: null,
        } };
      }
    }
    return { failure: this.invalidData() };
  }

  private invalidData(): ConnectorFailure {
    return { kind: 'failure', reason: 'invalid_data', observedAt: new Date().toISOString(), retryAfter: null };
  }

  private async recordFailure(userId: string, connectionId: string, revision: number, failure: ConnectorFailure): Promise<SyncOutcome> {
    return this.db.transaction(async (tx) => {
      const [connection] = await tx.select().from(providerConnection)
        .where(and(eq(providerConnection.id, connectionId), eq(providerConnection.userId, userId))).for('update');
      if (!connection) throw new NotFoundException('Banking connection not found');
      const [current] = await tx.select().from(providerSyncState)
        .where(eq(providerSyncState.providerConnectionId, connectionId));
      if (current.revision !== revision) return { status: 'superseded' } as const;
      await tx.update(providerSyncState).set({
        lastFailureAt: new Date(failure.observedAt), lastFailureReason: failure.reason,
        retryAfter: failure.retryAfter === null ? null : new Date(failure.retryAfter),
      }).where(eq(providerSyncState.providerConnectionId, connectionId));
      if (failure.reason === 'expired' || failure.reason === 'revoked') {
        await tx.update(providerConnection).set({ status: failure.reason })
          .where(eq(providerConnection.id, connectionId));
      }
      return { status: 'failed', reason: failure.reason, retryAfter: failure.retryAfter } as const;
    });
  }

  private async apply(tx: Tx, connectionId: string, userId: string, pages: ConnectorPage[]): Promise<number> {
    const accounts = new Map<string, AccountRow>();
    for (const row of await tx.select().from(account).where(eq(account.providerConnectionId, connectionId))) {
      if (row.userId !== userId) throw new InvalidBatchError('Account belongs to another user');
      if (row.externalId !== null) accounts.set(row.externalId, row);
    }

    for (const page of pages) {
      for (const snapshot of page.accounts) {
        const existing = accounts.get(snapshot.externalId);
        if (existing?.providerObservedAt && new Date(page.observedAt) < existing.providerObservedAt) continue;
        if (existing && (existing.type === 'credit_card') !== (snapshot.type === 'credit_card')) {
          throw new InvalidBatchError('Account balance meaning changed');
        }
        const incomingAsOf = snapshot.reportedBalance?.asOf;
        const olderBalance = existing?.lastSyncedAt && incomingAsOf &&
          new Date(incomingAsOf) < existing.lastSyncedAt;
        const fields = {
          type: snapshot.type, currency: snapshot.currency, number: snapshot.number,
          holderName: snapshot.holderName,
          providerObservedAt: new Date(page.observedAt),
          ...(existing && snapshot.historyCoverage.completeness === 'unknown' ? {} : {
            historyCompleteness: snapshot.historyCoverage.completeness,
            historyFrom: snapshot.historyCoverage.from, historyThrough: snapshot.historyCoverage.through,
          }),
          ...(snapshot.reportedBalance === null || olderBalance ? {} : {
            balance: snapshot.reportedBalance.amount,
            lastSyncedAt: snapshot.reportedBalance.asOf === null ? null : new Date(snapshot.reportedBalance.asOf),
          }),
        };
        const [saved] = existing
          ? await tx.update(account).set(fields).where(and(eq(account.id, existing.id), eq(account.userId, userId))).returning()
          : await tx.insert(account).values({
            ...fields, userId, providerConnectionId: connectionId, externalId: snapshot.externalId,
          }).returning();
        accounts.set(snapshot.externalId, saved);
      }
    }

    const movements = new Map<string, NormalizedMovement>();
    const observed = new Map<string, string>();
    const removed = new Map<string, { accountExternalId: string; externalId: string; reason: 'removed' | 'reversed'; providerUpdatedAt: string | null; observedAt: string }>();
    for (const page of pages) {
      for (const movement of page.movements) {
        const key = movementKey(movement.accountExternalId, movement.externalId);
        const earlier = movements.get(key);
        if (earlier && JSON.stringify(earlier) !== JSON.stringify(movement)) throw new InvalidBatchError('Conflicting versions in one sync run');
        movements.set(key, movement);
        observed.set(key, page.observedAt);
      }
      for (const removal of page.removedMovements) {
        removed.set(movementKey(removal.accountExternalId, removal.externalId), { ...removal, observedAt: page.observedAt });
      }
    }

    const taggingRules = await this.tagging.loadActiveRulesForUser(tx, userId);
    for (const [key, movement] of movements) {
      if (removed.has(key)) continue; // A removal wins regardless of page ordering.
      const owner = accounts.get(movement.accountExternalId);
      if (!owner) throw new InvalidBatchError('Movement references an unknown account');
      const [tombstone] = await tx.select().from(providerMovementRemoval).where(and(
        eq(providerMovementRemoval.providerConnectionId, connectionId),
        eq(providerMovementRemoval.accountExternalId, movement.accountExternalId),
        eq(providerMovementRemoval.movementExternalId, movement.externalId),
      ));
      if (tombstone) continue; // No implicit reactivation of a withdrawn movement.

      const [existing] = await tx.select().from(transaction).where(and(
        eq(transaction.accountId, owner.id), eq(transaction.externalId, movement.externalId),
      ));
      if (existing && existing.source !== 'provider') throw new InvalidBatchError('Provider ID collides with manual movement');
      const observedAt = observed.get(key)!;
      if (existing?.providerObservedAt && new Date(observedAt) < existing.providerObservedAt) continue;
      if (existing?.providerUpdatedAt && movement.providerUpdatedAt &&
        new Date(movement.providerUpdatedAt) < existing.providerUpdatedAt) continue;
      const related = movement.relatedMovement;
      const priorPair = existing?.providerInternalAssessment === 'internal' && related &&
        (related.kind === 'transfer_pair' || related.kind === 'card_payment_pair') &&
        existing.relationKind === related.kind && existing.relatedAccountExternalId === related.accountExternalId &&
        existing.relatedMovementExternalId === related.movementExternalId && existing.amount === movement.amount;
      const [priorRemoval] = priorPair ? await tx.select().from(providerMovementRemoval).where(and(
        eq(providerMovementRemoval.providerConnectionId, connectionId),
        eq(providerMovementRemoval.accountExternalId, related.accountExternalId),
        eq(providerMovementRemoval.movementExternalId, related.movementExternalId),
      )) : [];
      const assessment = this.assess(movement, owner, movements, accounts, removed, Boolean(priorPair && !priorRemoval));
      const effective = existing?.userInternalOverride ?? (assessment === 'unknown' ? null : assessment === 'internal');
      const direction = movementDirection(movement.amount);
      const receipt = existing ? await tx.select({ id: incomeReceipt.transactionId }).from(incomeReceipt)
        .where(eq(incomeReceipt.transactionId, existing.id)) : [];
      const reasons: ConflictReason[] = [];
      // A paired, owned transfer is hard evidence. 'External' inferred from a
      // merchant hint is not strong enough to contradict a user's override.
      if (existing?.userInternalOverride === false && assessment === 'internal') {
        reasons.push('internal_override_disagrees');
      }
      if (receipt.length && (direction !== 'credit' || effective !== false)) reasons.push('receipt_incompatible');

      const booked = bookingDate(movement.booked);
      const providerFields = {
        amount: movement.amount, type: direction, bookedAt: booked.bookedAt,
        bookedPrecision: movement.booked.precision, bookedOn: booked.bookedOn,
        description: movement.description, merchant: movement.merchant,
        providerUpdatedAt: movement.providerUpdatedAt === null ? null : new Date(movement.providerUpdatedAt),
        providerObservedAt: new Date(observedAt),
        providerKind: movement.providerKind, relationKind: movement.relatedMovement?.kind ?? null,
        relatedAccountExternalId: movement.relatedMovement?.accountExternalId ?? null,
        relatedMovementExternalId: movement.relatedMovement?.movementExternalId ?? null,
        counterpartyHolder: movement.counterpartyHolder,
        providerInternalAssessment: assessment, isInternalMovement: effective,
        reviewStatus: existing?.reviewStatus === 'needs_review' || reasons.length ? 'needs_review' as const : 'clear' as const,
      };
      const [saved] = existing
        ? await tx.update(transaction).set(providerFields).where(eq(transaction.id, existing.id)).returning()
        : await tx.insert(transaction).values({
          ...providerFields, accountId: owner.id, externalId: movement.externalId, source: 'provider',
        }).returning();
      for (const reason of reasons) {
        await this.recordConflict(tx, saved.id, reason, {
          amount: existing?.amount, type: existing?.type, bookedAt: existing?.bookedAt.toISOString(),
          isInternalMovement: existing?.isInternalMovement,
        }, { amount: movement.amount, type: direction, booked: movement.booked,
          providerInternalAssessment: assessment }, observedAt);
      }
      const tagRelevantCorrection = existing && (existing.merchant !== movement.merchant ||
        existing.description !== movement.description || existing.type !== direction ||
        existing.reviewStatus !== saved.reviewStatus || existing.amount !== movement.amount ||
        existing.providerKind !== movement.providerKind || existing.isInternalMovement !== effective);
      if (existing?.tagDecisionOrigin !== 'rule' || tagRelevantCorrection) {
        await this.tagging.applyForImportedMovement(tx, userId, saved, taggingRules);
      }
    }

    for (const removal of removed.values()) {
      const owner = accounts.get(removal.accountExternalId);
      const [tombstone] = await tx.insert(providerMovementRemoval).values({
        providerConnectionId: connectionId, accountExternalId: removal.accountExternalId,
        movementExternalId: removal.externalId, reason: removal.reason,
        observedAt: new Date(removal.observedAt),
        providerUpdatedAt: removal.providerUpdatedAt === null ? null : new Date(removal.providerUpdatedAt),
      }).onConflictDoNothing().returning();
      if (!owner) continue; // An out-of-order removal must still prevent a later first import.
      const [existing] = await tx.select().from(transaction).where(and(
        eq(transaction.accountId, owner.id), eq(transaction.externalId, removal.externalId),
      ));
      if (!existing || existing.removedAt !== null) continue;
      if (existing.source !== 'provider') throw new InvalidBatchError('Provider removal targets a manual movement');
      const [receipt] = await tx.select({ id: incomeReceipt.transactionId }).from(incomeReceipt)
        .where(eq(incomeReceipt.transactionId, existing.id));
      await tx.update(transaction).set({
        removedAt: tombstone?.observedAt ?? existing.removedAt ?? new Date(removal.observedAt),
        removalReason: removal.reason, reviewStatus: receipt ? 'needs_review' : existing.reviewStatus,
      }).where(eq(transaction.id, existing.id));
      if (receipt) await this.recordConflict(tx, existing.id, 'removed_confirmed_income', {
        amount: existing.amount, type: existing.type,
      }, { removalReason: removal.reason }, removal.observedAt);
    }

    const [row] = await tx.select({ conflicts: count() }).from(providerMovementConflict)
      .innerJoin(transaction, eq(transaction.id, providerMovementConflict.transactionId))
      .innerJoin(account, eq(account.id, transaction.accountId))
      .where(and(eq(account.providerConnectionId, connectionId), eq(account.userId, userId),
        isNull(providerMovementConflict.resolvedAt)));
    return row.conflicts;
  }

  private assess(movement: NormalizedMovement, owner: AccountRow, movements: Map<string, NormalizedMovement>,
    accounts: Map<string, AccountRow>, removed: Map<string, unknown>, previouslyVerified: boolean) {
    const relation = movement.relatedMovement;
    if (relation && (relation.kind === 'transfer_pair' || relation.kind === 'card_payment_pair')) {
      const otherAccount = accounts.get(relation.accountExternalId);
      const other = movements.get(movementKey(relation.accountExternalId, relation.movementExternalId));
      const paired = otherAccount && other && !removed.has(movementKey(relation.accountExternalId, relation.movementExternalId)) &&
        other.relatedMovement?.kind === relation.kind &&
        other.relatedMovement.accountExternalId === movement.accountExternalId &&
        other.relatedMovement.movementExternalId === movement.externalId &&
        toCents(other.amount) + toCents(movement.amount) === 0n;
      const cardTypesMatch = relation.kind === 'card_payment_pair'
        ? (owner.type === 'credit_card') !== (otherAccount?.type === 'credit_card')
        : owner.type !== 'credit_card' && otherAccount?.type !== 'credit_card';
      if (paired && relation.accountExternalId !== movement.accountExternalId && cardTypesMatch) return 'internal' as const;
      if (previouslyVerified && !removed.has(movementKey(relation.accountExternalId, relation.movementExternalId))) {
        return 'internal' as const;
      }
      return 'unknown' as const;
    }
    if (movement.providerKind === 'transfer' || movement.providerKind === 'card_payment' || movement.providerKind === 'unknown') {
      return 'unknown' as const;
    }
    if (movement.providerKind === 'reversal' && relation?.kind === 'reversal' &&
      accounts.has(relation.accountExternalId)) return 'external' as const;
    if (movement.providerKind === 'other' && movement.merchant !== null &&
      (owner.type !== 'credit_card' || movementDirection(movement.amount) === 'debit')) return 'external' as const;
    return 'unknown' as const;
  }

  private async recordConflict(tx: Tx, transactionId: string, reason: ConflictReason,
    previousFacts: Record<string, unknown>, incomingFacts: Record<string, unknown>, observedAt: string) {
    await tx.insert(providerMovementConflict).values({
      transactionId, reason, previousFacts, incomingFacts, observedAt: new Date(observedAt),
    }).onConflictDoUpdate({
      target: [providerMovementConflict.transactionId, providerMovementConflict.reason],
      set: { incomingFacts, observedAt: new Date(observedAt), resolvedAt: null },
    });
  }
}
