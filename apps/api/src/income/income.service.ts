import {
  type IncomeExpectation,
  IncomeExpectationInputSchema,
  type IncomeReceipt,
  IncomeReceiptInputSchema,
  type IncomeSource,
  IncomeSourceInputSchema,
  type IncomeSummary,
  MonthSchema,
} from "@lazyfinance/contracts";
import type {
  IncomeFacts,
  IncomeSourceRecord,
} from "@lazyfinance/contracts/internal";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import { fromCents, toCents } from "../_utils/money";
import { monthBounds } from "../_utils/period";
import { santiagoMonth } from "../_utils/santiago-time";
import { PersistenceClient } from "../persistence/persistence.client";
import { movementTotals } from "../transactions/movement-totals";
import { expectedIncomeForMonth } from "./income-schedule";

function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      message: "Invalid income input",
      issues: result.error.issues,
    });

  return result.data;
}

function sourceResponse({
  userId: _,
  ...source
}: IncomeSourceRecord): IncomeSource {
  return source;
}

function receiptResponse(
  receipt: IncomeFacts["receipts"][number],
): IncomeReceipt {
  const { transactionId, sourceId, sourceName, bookedAt, amount, confirmedAt } =
    receipt;
  return { transactionId, sourceId, sourceName, bookedAt, amount, confirmedAt };
}

function activeReceipts(receipts: IncomeFacts["receipts"]) {
  return receipts.filter(
    (row) =>
      row.type === "credit" &&
      row.isInternalMovement === false &&
      row.reviewStatus === "clear" &&
      row.removedAt === null,
  );
}

@Injectable()
export class IncomeService {
  constructor(private readonly persistence: PersistenceClient) {}

  async listSourcesForUser(userId: string): Promise<IncomeSource[]> {
    return (await this.persistence.user(userId).income.sources.query()).map(
      sourceResponse,
    );
  }

  async getSourceForUser(userId: string, id: string): Promise<IncomeSource> {
    return sourceResponse(
      await this.persistence.user(userId).income.source.query({ id }),
    );
  }

  async createSourceForUser(
    userId: string,
    value: unknown,
  ): Promise<IncomeSource> {
    const source = input(IncomeSourceInputSchema, value);
    source.expectedAmount =
      source.expectedAmount === null
        ? null
        : fromCents(toCents(source.expectedAmount));

    return sourceResponse(
      await this.persistence.user(userId).income.createSource.mutate(source),
    );
  }

  async updateSourceForUser(
    userId: string,
    id: string,
    value: unknown,
  ): Promise<IncomeSource> {
    const source = input(IncomeSourceInputSchema, value);
    source.expectedAmount =
      source.expectedAmount === null
        ? null
        : fromCents(toCents(source.expectedAmount));

    return sourceResponse(
      await this.persistence
        .user(userId)
        .income.updateSource.mutate({ id, source }),
    );
  }

  async archiveSourceForUser(
    userId: string,
    id: string,
    now = new Date(),
  ): Promise<IncomeSource> {
    return sourceResponse(
      await this.persistence
        .user(userId)
        .income.archiveSource.mutate({ id, at: now.toISOString() }),
    );
  }

  listExpectationsForUser(
    userId: string,
    id: string,
  ): Promise<IncomeExpectation[]> {
    return this.persistence.user(userId).incomeExpectations.list.query({ id });
  }

  async createExpectationForUser(
    userId: string,
    sourceId: string,
    value: unknown,
  ): Promise<IncomeExpectation> {
    const expectation = input(IncomeExpectationInputSchema, value);
    expectation.amount = fromCents(toCents(expectation.amount));

    return this.persistence
      .user(userId)
      .incomeExpectations.create.mutate({ sourceId, expectation });
  }

  async updateExpectationForUser(
    userId: string,
    id: string,
    value: unknown,
  ): Promise<IncomeExpectation> {
    const expectation = input(IncomeExpectationInputSchema, value);
    expectation.amount = fromCents(toCents(expectation.amount));

    return this.persistence
      .user(userId)
      .incomeExpectations.update.mutate({ id, expectation });
  }

  deleteExpectationForUser(userId: string, id: string): Promise<void> {
    return this.persistence
      .user(userId)
      .incomeExpectations.remove.mutate({ id });
  }

  async getExpectedForUser(userId: string, month = santiagoMonth(new Date())) {
    const facts = await this.persistence
      .user(userId)
      .income.expectedFacts.query(monthBounds(input(MonthSchema, month)));
    return expectedIncomeForMonth(month, facts.sources, facts.expectations);
  }

  async confirmReceiptForUser(
    userId: string,
    transactionId: string,
    value: unknown,
    now = new Date(),
  ): Promise<IncomeReceipt> {
    const { sourceId } = input(IncomeReceiptInputSchema, value);
    return receiptResponse(
      await this.persistence.user(userId).incomeReceipts.confirm.mutate({
        transactionId,
        sourceId,
        at: now.toISOString(),
      }),
    );
  }

  clearReceiptForUser(userId: string, id: string): Promise<void> {
    return this.persistence.user(userId).incomeReceipts.clear.mutate({ id });
  }

  async listReceiptsForUser(
    userId: string,
    month = santiagoMonth(new Date()),
    now = new Date(),
  ): Promise<IncomeReceipt[]> {
    const receipts = await this.persistence.user(userId).income.receipts.query({
      ...monthBounds(input(MonthSchema, month)),
      asOf: now.toISOString(),
    });
    return activeReceipts(receipts).map(receiptResponse);
  }

  async getSummaryForUser(
    userId: string,
    month = santiagoMonth(new Date()),
    now = new Date(),
  ): Promise<IncomeSummary> {
    const facts = await this.persistence.user(userId).income.facts.query({
      ...monthBounds(input(MonthSchema, month)),
      asOf: now.toISOString(),
    });
    const expected = expectedIncomeForMonth(
      month,
      facts.sources,
      facts.expectations,
    );
    const received = movementTotals(facts.aggregates);

    return {
      month,
      currency: "CLP",
      asOf: now.toISOString(),
      expectedIncome: expected.totals,
      receivedIncome: received.receivedIncome,
      unclassifiedCredits: received.unclassifiedCredits,
      unresolvedMovementCount: received.unresolvedMovementCount,
      expectedPayments: expected.payments,
      receipts: activeReceipts(facts.receipts).map(receiptResponse),
    };
  }
}
