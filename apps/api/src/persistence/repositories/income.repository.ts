import type { IncomeExpectationInput, IncomeSourceInput } from '@lazyfinance/contracts';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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

  /** Return all calendar inputs from the same read-only snapshot. */
  readExpectedForUser(userId: string, month: string) {
    return this.db.transaction(async (tx) => {
      const income = new IncomeRepository(tx);
      const [sources, expectations] = await Promise.all([
        income.listSourcesForUser(userId), income.listExpectationsForUser(userId, undefined, month),
      ]);
      return { sources, expectations };
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }

  /** Totals, receipts and calendar inputs must describe the same snapshot. */
  readSummaryForUser(userId: string, month: string, asOf: Date) {
    return this.db.transaction(async (tx) => {
      const income = new IncomeRepository(tx);
      const transactions = new TransactionRepository(tx);
      const [sources, expectations, received, receipts] = await Promise.all([
        income.listSourcesForUser(userId), income.listExpectationsForUser(userId, undefined, month),
        transactions.sumByMonthForUser(userId, month, asOf), income.listReceiptsForMonth(userId, month, asOf),
      ]);
      return { sources, expectations, received, receipts };
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }

  private async requiredSource(userId: string, id: string) {
    const source = await this.findSource(userId, id, true);
    if (!source) throw new NotFoundException('Income source not found');
    return source;
  }

  private expectationInput(source: NonNullable<Awaited<ReturnType<IncomeRepository['findSourceForUser']>>>, input: IncomeExpectationInput) {
    if (source.archivedAt) throw new BadRequestException('Archived income sources cannot be changed');
    if (source.regularity !== 'irregular') throw new BadRequestException('One-off expectations require an irregular source');
    if (input.date < source.startDate || (source.endDate && input.date > source.endDate)) {
      throw new BadRequestException('Expected date must be within the source’s effective dates');
    }
  }

  async listSourcesForUser(userId: string) {
    return this.db.select().from(incomeSource).where(eq(incomeSource.userId, userId))
      .orderBy(asc(incomeSource.createdAt), asc(incomeSource.id));
  }

  findSourceForUser(userId: string, id: string) {
    return this.findSource(userId, id, false);
  }

  private async findSource(userId: string, id: string, lock: boolean) {
    const query = this.db.select().from(incomeSource).where(and(eq(incomeSource.id, id), eq(incomeSource.userId, userId)));
    const [row] = await (lock ? query.for('update') : query);
    return row ?? null;
  }

  async createSourceForUser(userId: string, input: IncomeSourceInput) {
    const [row] = await this.db.insert(incomeSource).values({ ...input, userId }).returning();
    return row;
  }

  async updateSourceForUser(userId: string, id: string, input: IncomeSourceInput) {
    return this.db.transaction(async (tx) => {
      const income = new IncomeRepository(tx);
      const source = await income.requiredSource(userId, id);
      if (source.archivedAt) throw new BadRequestException('Archived income sources cannot be changed');
      if (source.regularity === 'irregular' && input.regularity === 'regular' &&
        (await income.listExpectationsForUser(userId, id)).length > 0) {
        throw new BadRequestException('Remove one-off expectations before changing to regular income');
      }
      return income.updateSource(userId, id, input);
    });
  }

  private async updateSource(userId: string, id: string, input: IncomeSourceInput) {
    const [row] = await this.db.update(incomeSource).set(input)
      .where(and(eq(incomeSource.id, id), eq(incomeSource.userId, userId))).returning();
    return row;
  }

  async archiveSourceForUser(userId: string, id: string, now: Date) {
    return this.db.transaction(async (tx) => {
      const income = new IncomeRepository(tx);
      const source = await income.requiredSource(userId, id);
      return source.archivedAt ? source : income.archiveSource(userId, id, now);
    });
  }

  private async archiveSource(userId: string, id: string, now: Date) {
    const [row] = await this.db.update(incomeSource).set({ archivedAt: now })
      .where(and(eq(incomeSource.id, id), eq(incomeSource.userId, userId))).returning();
    return row;
  }

  async listExpectationsForUser(userId: string, sourceId?: string, month?: string) {
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

  async createExpectationForUser(userId: string, sourceId: string, input: IncomeExpectationInput) {
    return this.db.transaction(async (tx) => {
      const income = new IncomeRepository(tx);
      const source = await income.requiredSource(userId, sourceId);
      income.expectationInput(source, input);
      return income.createExpectation(sourceId, input);
    });
  }

  async updateExpectationForUser(userId: string, id: string, input: IncomeExpectationInput) {
    return this.db.transaction(async (tx) => {
      const income = new IncomeRepository(tx);
      const row = await income.findExpectationForUser(userId, id);
      if (!row) throw new NotFoundException('Income expectation not found');
      income.expectationInput(row.source, input);
      return income.updateExpectation(id, input);
    });
  }

  async deleteExpectationForUser(userId: string, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const income = new IncomeRepository(tx);
      if (!await income.findExpectationForUser(userId, id)) throw new NotFoundException('Income expectation not found');
      await income.deleteExpectation(id);
    });
  }

  private async findExpectationForUser(userId: string, id: string) {
    const [row] = await this.db.select({
      expectation: getTableColumns(incomeExpectation),
      source: getTableColumns(incomeSource),
    }).from(incomeExpectation).innerJoin(incomeSource, eq(incomeSource.id, incomeExpectation.sourceId))
      .where(and(eq(incomeExpectation.id, id), eq(incomeSource.userId, userId))).for('update');
    return row ?? null;
  }

  private async createExpectation(sourceId: string, input: IncomeExpectationInput) {
    const [row] = await this.db.insert(incomeExpectation).values({ ...input, sourceId }).returning();
    return row;
  }

  private async updateExpectation(id: string, input: IncomeExpectationInput) {
    const [row] = await this.db.update(incomeExpectation).set(input).where(eq(incomeExpectation.id, id)).returning();
    return row;
  }

  private async deleteExpectation(id: string) {
    await this.db.delete(incomeExpectation).where(eq(incomeExpectation.id, id));
  }

  async confirmReceiptForUser(userId: string, transactionId: string, sourceId: string, now: Date) {
    return this.db.transaction(async (tx) => {
      const income = new IncomeRepository(tx);
      await income.requiredSource(userId, sourceId);
      const movement = await income.findTransactionForUser(userId, transactionId);
      if (!movement) throw new NotFoundException('Transaction not found');
      if (movement.type !== 'credit' || movement.isInternalMovement !== false || movement.reviewStatus !== 'clear' ||
        movement.removedAt !== null || movement.bookedAt > now) {
        throw new BadRequestException('Received income requires a booked, non-internal credit transaction');
      }
      let receipt = await income.findReceiptForUser(userId, transactionId);
      if (receipt?.sourceId !== sourceId) {
        await income.confirmReceipt(transactionId, sourceId, now);
        receipt = await income.findReceiptForUser(userId, transactionId);
      }
      if (!receipt) throw new NotFoundException('Income receipt not found');
      return receipt;
    });
  }

  async clearReceiptForUser(userId: string, transactionId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const income = new IncomeRepository(tx);
      if (!await income.findTransactionForUser(userId, transactionId)) throw new NotFoundException('Transaction not found');
      await income.deleteReceipt(transactionId);
    });
  }

  private async findTransactionForUser(userId: string, id: string) {
    const [row] = await this.db.select(getTableColumns(transaction)).from(transaction)
      .innerJoin(account, eq(account.id, transaction.accountId))
      .where(and(eq(transaction.id, id), eq(account.userId, userId))).for('update');
    return row ?? null;
  }

  private async confirmReceipt(transactionId: string, sourceId: string, now: Date) {
    await this.db.insert(incomeReceipt).values({ transactionId, sourceId, confirmedAt: now })
      .onConflictDoUpdate({ target: incomeReceipt.transactionId, set: { sourceId, confirmedAt: now } });
  }

  private async deleteReceipt(transactionId: string) {
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

  private async findReceiptForUser(userId: string, transactionId: string) {
    const [row] = await this.receiptsQuery().where(and(
      eq(incomeSource.userId, userId), eq(account.userId, userId), eq(transaction.id, transactionId),
    ));
    return row ?? null;
  }

  async listReceiptsForMonth(userId: string, month: string, asOf: Date) {
    const { start, end } = monthBounds(month);
    return this.receiptsQuery().where(and(
      eq(incomeSource.userId, userId), eq(account.userId, userId),
      eq(transaction.type, 'credit'), eq(transaction.isInternalMovement, false), eq(transaction.reviewStatus, 'clear'),
      isNull(transaction.removedAt),
      inSantiagoPeriod(start, end), lte(transaction.bookedAt, asOf),
    )).orderBy(asc(transaction.bookedAt), asc(transaction.id));
  }
}
