import type { IncomeExpectationInput, IncomeSourceInput } from '@lazyfinance/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, getTableColumns, gte, isNull, lt, lte } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_PG_CLIENT } from '../drizzle.tokens';
import * as schema from '../schema';
import { account } from '../schema/account.table';
import { incomeExpectation } from '../schema/income-expectation.table';
import { incomeReceipt } from '../schema/income-receipt.table';
import { incomeSource } from '../schema/income-source.table';
import { transaction } from '../schema/transaction.table';
import { inSantiagoPeriod, monthBounds } from './financial-filters';
import { TransactionRepository } from './transaction.repository';

type IncomeDatabase = Pick<PostgresJsDatabase<typeof schema>, 'select' | 'insert' | 'update' | 'delete' | 'transaction'>;

@Injectable()
export class IncomeRepository {
  constructor(@Inject(DRIZZLE_PG_CLIENT) private readonly db: IncomeDatabase) {}

  async transaction<T>(work: (repository: IncomeRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new IncomeRepository(tx)));
  }

  async readSnapshot<T>(work: (income: IncomeRepository, transactions: TransactionRepository) => Promise<T>): Promise<T> {
    return this.db.transaction(
      (tx) => work(new IncomeRepository(tx), new TransactionRepository(tx)),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  listSourcesForUser(userId: string) {
    return this.db.select().from(incomeSource).where(eq(incomeSource.userId, userId))
      .orderBy(asc(incomeSource.createdAt), asc(incomeSource.id));
  }

  async findSourceForUser(userId: string, id: string, lock = false) {
    const query = this.db.select().from(incomeSource).where(and(eq(incomeSource.id, id), eq(incomeSource.userId, userId)));
    const [row] = await (lock ? query.for('update') : query);
    return row ?? null;
  }

  async createSource(userId: string, input: IncomeSourceInput) {
    const [row] = await this.db.insert(incomeSource).values({ ...input, userId }).returning();
    return row;
  }

  async updateSource(userId: string, id: string, input: IncomeSourceInput) {
    const [row] = await this.db.update(incomeSource).set(input)
      .where(and(eq(incomeSource.id, id), eq(incomeSource.userId, userId))).returning();
    return row;
  }

  async archiveSource(userId: string, id: string, now: Date) {
    const [row] = await this.db.update(incomeSource).set({ archivedAt: now })
      .where(and(eq(incomeSource.id, id), eq(incomeSource.userId, userId))).returning();
    return row;
  }

  listExpectationsForUser(userId: string, sourceId?: string, month?: string) {
    const bounds = month ? monthBounds(month) : null;
    return this.db.select(getTableColumns(incomeExpectation)).from(incomeExpectation)
      .innerJoin(incomeSource, eq(incomeSource.id, incomeExpectation.sourceId))
      .where(and(
        eq(incomeSource.userId, userId),
        sourceId ? eq(incomeSource.id, sourceId) : undefined,
        bounds ? gte(incomeExpectation.date, bounds.start.slice(0, 10)) : undefined,
        bounds ? lt(incomeExpectation.date, bounds.end.slice(0, 10)) : undefined,
      )).orderBy(asc(incomeExpectation.date), asc(incomeExpectation.id));
  }

  async findExpectationForUser(userId: string, id: string) {
    const [row] = await this.db.select({
      expectation: getTableColumns(incomeExpectation),
      source: getTableColumns(incomeSource),
    }).from(incomeExpectation).innerJoin(incomeSource, eq(incomeSource.id, incomeExpectation.sourceId))
      .where(and(eq(incomeExpectation.id, id), eq(incomeSource.userId, userId))).for('update');
    return row ?? null;
  }

  async createExpectation(sourceId: string, input: IncomeExpectationInput) {
    const [row] = await this.db.insert(incomeExpectation).values({ ...input, sourceId }).returning();
    return row;
  }

  async updateExpectation(id: string, input: IncomeExpectationInput) {
    const [row] = await this.db.update(incomeExpectation).set(input).where(eq(incomeExpectation.id, id)).returning();
    return row;
  }

  async deleteExpectation(id: string) {
    await this.db.delete(incomeExpectation).where(eq(incomeExpectation.id, id));
  }

  async findTransactionForUser(userId: string, id: string) {
    const [row] = await this.db.select(getTableColumns(transaction)).from(transaction)
      .innerJoin(account, eq(account.id, transaction.accountId))
      .where(and(eq(transaction.id, id), eq(account.userId, userId))).for('update');
    return row ?? null;
  }

  async confirmReceipt(transactionId: string, sourceId: string, now: Date) {
    await this.db.insert(incomeReceipt).values({ transactionId, sourceId, confirmedAt: now })
      .onConflictDoUpdate({ target: incomeReceipt.transactionId, set: { sourceId, confirmedAt: now } });
  }

  async deleteReceipt(transactionId: string) {
    await this.db.delete(incomeReceipt).where(eq(incomeReceipt.transactionId, transactionId));
  }

  private receiptsQuery() {
    return this.db.select({
      transactionId: transaction.id,
      sourceId: incomeSource.id,
      sourceName: incomeSource.name,
      bookedAt: transaction.bookedAt,
      amount: transaction.amount,
      confirmedAt: incomeReceipt.confirmedAt,
    }).from(incomeReceipt)
      .innerJoin(incomeSource, eq(incomeSource.id, incomeReceipt.sourceId))
      .innerJoin(transaction, eq(transaction.id, incomeReceipt.transactionId))
      .innerJoin(account, eq(account.id, transaction.accountId))
      .$dynamic();
  }

  async findReceiptForUser(userId: string, transactionId: string) {
    const [row] = await this.receiptsQuery().where(and(
      eq(incomeSource.userId, userId), eq(account.userId, userId), eq(transaction.id, transactionId),
    ));
    return row ?? null;
  }

  listReceiptsForMonth(userId: string, month: string, asOf: Date) {
    const { start, end } = monthBounds(month);
    return this.receiptsQuery().where(and(
      eq(incomeSource.userId, userId), eq(account.userId, userId),
      eq(transaction.type, 'credit'), eq(transaction.isInternalMovement, false),
      isNull(transaction.removedAt),
      inSantiagoPeriod(start, end), lte(transaction.bookedAt, asOf),
    )).orderBy(asc(transaction.bookedAt), asc(transaction.id));
  }
}
