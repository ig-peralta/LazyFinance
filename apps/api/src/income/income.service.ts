import {
  IncomeExpectationInputSchema,
  IncomeReceiptInputSchema,
  IncomeSourceInputSchema,
  MonthSchema,
  type IncomeExpectation,
  type IncomeReceipt,
  type IncomeSource,
  type IncomeSummary,
} from '@lazyfinance/contracts';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { fromCents, toCents } from '../_utils/money';
import { santiagoMonth } from '../_utils/santiago-time';
import { IncomeRepository } from '../persistence/repositories/income.repository';
import type { IncomeSourceRecord } from './income-source.record';
import { expectedIncomeForMonth } from './income-schedule';

function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ message: 'Invalid income input', issues: result.error.issues });
  return result.data;
}

function sourceResponse({ userId: _, archivedAt, createdAt, updatedAt, ...source }: IncomeSourceRecord): IncomeSource {
  return {
    ...source,
    archivedAt: archivedAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

type ReceiptRow = Awaited<ReturnType<IncomeRepository['confirmReceiptForUser']>>;

function receiptResponse({ bookedAt, confirmedAt, ...receipt }: ReceiptRow): IncomeReceipt {
  return { ...receipt, bookedAt: bookedAt.toISOString(), confirmedAt: confirmedAt.toISOString() };
}

@Injectable()
export class IncomeService {
  constructor(private readonly income: IncomeRepository) {}

  private async source(userId: string, id: string) {
    const source = await this.income.findSourceForUser(userId, id);
    if (!source) throw new NotFoundException('Income source not found');
    return source;
  }

  async listSourcesForUser(userId: string): Promise<IncomeSource[]> {
    return (await this.income.listSourcesForUser(userId)).map(sourceResponse);
  }

  async getSourceForUser(userId: string, id: string): Promise<IncomeSource> {
    return sourceResponse(await this.source(userId, id));
  }

  async createSourceForUser(userId: string, value: unknown): Promise<IncomeSource> {
    const source = input(IncomeSourceInputSchema, value);
    source.expectedAmount = source.expectedAmount === null ? null : fromCents(toCents(source.expectedAmount));
    return sourceResponse(await this.income.createSourceForUser(userId, source));
  }

  async updateSourceForUser(userId: string, id: string, value: unknown): Promise<IncomeSource> {
    const update = input(IncomeSourceInputSchema, value);
    update.expectedAmount = update.expectedAmount === null ? null : fromCents(toCents(update.expectedAmount));
    return sourceResponse(await this.income.updateSourceForUser(userId, id, update));
  }

  async archiveSourceForUser(userId: string, id: string, now = new Date()): Promise<IncomeSource> {
    return sourceResponse(await this.income.archiveSourceForUser(userId, id, now));
  }

  async listExpectationsForUser(userId: string, sourceId: string): Promise<IncomeExpectation[]> {
    await this.source(userId, sourceId);
    return this.income.listExpectationsForUser(userId, sourceId);
  }

  async createExpectationForUser(userId: string, sourceId: string, value: unknown): Promise<IncomeExpectation> {
    const expectation = input(IncomeExpectationInputSchema, value);
    return this.income.createExpectationForUser(userId, sourceId,
      { ...expectation, amount: fromCents(toCents(expectation.amount)) });
  }

  async updateExpectationForUser(userId: string, id: string, value: unknown): Promise<IncomeExpectation> {
    const expectation = input(IncomeExpectationInputSchema, value);
    return this.income.updateExpectationForUser(userId, id,
      { ...expectation, amount: fromCents(toCents(expectation.amount)) });
  }

  async deleteExpectationForUser(userId: string, id: string): Promise<void> {
    await this.income.deleteExpectationForUser(userId, id);
  }

  async getExpectedForUser(userId: string, month = santiagoMonth(new Date())) {
    input(MonthSchema, month);
    const { sources, expectations } = await this.income.readExpectedForUser(userId, month);
    return expectedIncomeForMonth(month, sources, expectations);
  }

  async confirmReceiptForUser(userId: string, transactionId: string, value: unknown, now = new Date()): Promise<IncomeReceipt> {
    const { sourceId } = input(IncomeReceiptInputSchema, value);
    return receiptResponse(await this.income.confirmReceiptForUser(userId, transactionId, sourceId, now));
  }

  async clearReceiptForUser(userId: string, transactionId: string): Promise<void> {
    await this.income.clearReceiptForUser(userId, transactionId);
  }

  async listReceiptsForUser(userId: string, month = santiagoMonth(new Date()), now = new Date()): Promise<IncomeReceipt[]> {
    input(MonthSchema, month);
    return (await this.income.listReceiptsForMonth(userId, month, now)).map(receiptResponse);
  }

  async getSummaryForUser(userId: string, month = santiagoMonth(new Date()), now = new Date()): Promise<IncomeSummary> {
    input(MonthSchema, month);
    const { sources, expectations, received, receipts } = await this.income.readSummaryForUser(userId, month, now);
    const expected = expectedIncomeForMonth(month, sources, expectations);
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
  }
}
