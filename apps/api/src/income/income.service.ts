import {
  IncomeExpectationInputSchema,
  IncomeReceiptInputSchema,
  IncomeSourceInputSchema,
  MonthSchema,
  type IncomeExpectation,
  type IncomeExpectationInput,
  type IncomeReceipt,
  type IncomeSource,
  type IncomeSummary,
} from '@lazyfinance/contracts';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { fromCents, toCents } from '../_utils/money';
import { santiagoMonth } from '../_utils/santiago-time';
import { IncomeRepository } from '../drizzle/repositories/income.repository';
import type { IncomeSourceRow } from '../drizzle/schema/income-source.table';
import { expectedIncomeForMonth } from './income-schedule';

function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ message: 'Invalid income input', issues: result.error.issues });
  return result.data;
}

function sourceResponse({ userId: _, archivedAt, createdAt, updatedAt, ...source }: IncomeSourceRow): IncomeSource {
  return {
    ...source,
    archivedAt: archivedAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

type ReceiptRow = NonNullable<Awaited<ReturnType<IncomeRepository['findReceiptForUser']>>>;

function receiptResponse({ bookedAt, confirmedAt, ...receipt }: ReceiptRow): IncomeReceipt {
  return { ...receipt, bookedAt: bookedAt.toISOString(), confirmedAt: confirmedAt.toISOString() };
}

@Injectable()
export class IncomeService {
  constructor(private readonly income: IncomeRepository) {}

  private async source(repository: IncomeRepository, userId: string, id: string, lock = false) {
    const source = await repository.findSourceForUser(userId, id, lock);
    if (!source) throw new NotFoundException('Income source not found');
    return source;
  }

  private editable(source: IncomeSourceRow) {
    if (source.archivedAt) throw new BadRequestException('Archived income sources cannot be changed');
  }

  private expectationInput(source: IncomeSourceRow, value: unknown): IncomeExpectationInput {
    this.editable(source);
    if (source.regularity !== 'irregular') throw new BadRequestException('One-off expectations require an irregular source');
    const expectation = input(IncomeExpectationInputSchema, value);
    if (expectation.date < source.startDate || (source.endDate && expectation.date > source.endDate)) {
      throw new BadRequestException('Expected date must be within the source’s effective dates');
    }
    return { ...expectation, amount: fromCents(toCents(expectation.amount)) };
  }

  async listSourcesForUser(userId: string): Promise<IncomeSource[]> {
    return (await this.income.listSourcesForUser(userId)).map(sourceResponse);
  }

  async getSourceForUser(userId: string, id: string): Promise<IncomeSource> {
    return sourceResponse(await this.source(this.income, userId, id));
  }

  async createSourceForUser(userId: string, value: unknown): Promise<IncomeSource> {
    const source = input(IncomeSourceInputSchema, value);
    source.expectedAmount = source.expectedAmount === null ? null : fromCents(toCents(source.expectedAmount));
    return sourceResponse(await this.income.createSource(userId, source));
  }

  async updateSourceForUser(userId: string, id: string, value: unknown): Promise<IncomeSource> {
    const update = input(IncomeSourceInputSchema, value);
    update.expectedAmount = update.expectedAmount === null ? null : fromCents(toCents(update.expectedAmount));
    return this.income.transaction(async (repository) => {
      const source = await this.source(repository, userId, id, true);
      this.editable(source);
      if (source.regularity === 'irregular' && update.regularity === 'regular' &&
        (await repository.listExpectationsForUser(userId, id)).length > 0) {
        throw new BadRequestException('Remove one-off expectations before changing to regular income');
      }
      return sourceResponse(await repository.updateSource(userId, id, update));
    });
  }

  async archiveSourceForUser(userId: string, id: string, now = new Date()): Promise<IncomeSource> {
    return this.income.transaction(async (repository) => {
      const source = await this.source(repository, userId, id, true);
      return sourceResponse(source.archivedAt ? source : await repository.archiveSource(userId, id, now));
    });
  }

  async listExpectationsForUser(userId: string, sourceId: string): Promise<IncomeExpectation[]> {
    await this.source(this.income, userId, sourceId);
    return this.income.listExpectationsForUser(userId, sourceId);
  }

  async createExpectationForUser(userId: string, sourceId: string, value: unknown): Promise<IncomeExpectation> {
    return this.income.transaction(async (repository) => {
      const source = await this.source(repository, userId, sourceId, true);
      return repository.createExpectation(sourceId, this.expectationInput(source, value));
    });
  }

  async updateExpectationForUser(userId: string, id: string, value: unknown): Promise<IncomeExpectation> {
    return this.income.transaction(async (repository) => {
      const row = await repository.findExpectationForUser(userId, id);
      if (!row) throw new NotFoundException('Income expectation not found');
      return repository.updateExpectation(id, this.expectationInput(row.source, value));
    });
  }

  async deleteExpectationForUser(userId: string, id: string): Promise<void> {
    await this.income.transaction(async (repository) => {
      if (!await repository.findExpectationForUser(userId, id)) throw new NotFoundException('Income expectation not found');
      await repository.deleteExpectation(id);
    });
  }

  private async expected(repository: IncomeRepository, userId: string, month: string) {
    const [sources, expectations] = await Promise.all([
      repository.listSourcesForUser(userId), repository.listExpectationsForUser(userId, undefined, month),
    ]);
    return expectedIncomeForMonth(month, sources, expectations);
  }

  async getExpectedForUser(userId: string, month = santiagoMonth(new Date())) {
    input(MonthSchema, month);
    return this.income.readSnapshot((repository) => this.expected(repository, userId, month));
  }

  async confirmReceiptForUser(userId: string, transactionId: string, value: unknown, now = new Date()): Promise<IncomeReceipt> {
    const { sourceId } = input(IncomeReceiptInputSchema, value);
    return this.income.transaction(async (repository) => {
      await this.source(repository, userId, sourceId, true);
      const transaction = await repository.findTransactionForUser(userId, transactionId);
      if (!transaction) throw new NotFoundException('Transaction not found');
      if (transaction.type !== 'credit' || transaction.isInternalMovement !== false || transaction.reviewStatus !== 'clear' ||
        transaction.removedAt !== null || transaction.bookedAt > now) {
        throw new BadRequestException('Received income requires a booked, non-internal credit transaction');
      }
      let receipt = await repository.findReceiptForUser(userId, transactionId);
      if (receipt?.sourceId !== sourceId) {
        await repository.confirmReceipt(transactionId, sourceId, now);
        receipt = await repository.findReceiptForUser(userId, transactionId);
      }
      if (!receipt) throw new NotFoundException('Income receipt not found');
      return receiptResponse(receipt);
    });
  }

  async clearReceiptForUser(userId: string, transactionId: string): Promise<void> {
    await this.income.transaction(async (repository) => {
      if (!await repository.findTransactionForUser(userId, transactionId)) throw new NotFoundException('Transaction not found');
      await repository.deleteReceipt(transactionId);
    });
  }

  async listReceiptsForUser(userId: string, month = santiagoMonth(new Date()), now = new Date()): Promise<IncomeReceipt[]> {
    input(MonthSchema, month);
    return (await this.income.listReceiptsForMonth(userId, month, now)).map(receiptResponse);
  }

  async getSummaryForUser(userId: string, month = santiagoMonth(new Date()), now = new Date()): Promise<IncomeSummary> {
    input(MonthSchema, month);
    return this.income.readSnapshot(async (repository, transactions) => {
      const [expected, received, receipts] = await Promise.all([
        this.expected(repository, userId, month),
        transactions.sumByMonthForUser(userId, month, now),
        repository.listReceiptsForMonth(userId, month, now),
      ]);
      return {
        month,
        currency: 'CLP',
        asOf: now.toISOString(),
        expectedIncome: expected.totals,
        receivedIncome: received.receivedIncome,
        unclassifiedCredits: { amount: received.unclassifiedCreditAmount, count: received.unclassifiedCreditCount },
        unresolvedMovementCount: received.unresolvedMovementCount ?? 0,
        expectedPayments: expected.payments,
        receipts: receipts.map(receiptResponse),
      };
    });
  }
}
