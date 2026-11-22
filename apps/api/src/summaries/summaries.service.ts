import type { MonthlyComparison, MonthlySummary } from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { movementTotals } from "../finance/movement-totals";
import { IncomeService } from "../income/income.service";
import { PersistenceClient } from "../persistence/persistence.client";
import { fromCents, toCents } from "../utils/money";
import { monthBounds, previousMonth } from "../utils/period";
import { santiagoMonth, santiagoParts } from "../utils/santiago-time";
import { spendingByTag } from "./spending-by-tag";

/** Actual purchase windows; the current month compares with the same prior-month elapsed days. */
export function comparisonPeriods(month: string, now: Date) {
  const previous = previousMonth(month);
  const partial = month === santiagoMonth(now);
  const { day, hour, minute, second } = santiagoParts(now);
  const previousDays = new Date(
    Date.UTC(Number(previous.slice(0, 4)), Number(previous.slice(5, 7)), 0),
  ).getUTCDate();
  const previousEnd =
    Number(day) > previousDays
      ? monthBounds(previous).end
      : `${previous}-${day} ${hour}:${minute}:${second}`;
  return {
    previousMonth: previous,
    partial,
    current: monthBounds(month),
    previous: {
      start: monthBounds(previous).start,
      end: partial ? previousEnd : monthBounds(previous).end,
    },
  };
}

@Injectable()
export class SummariesService {
  constructor(
    private readonly persistence: PersistenceClient,
    private readonly income: IncomeService,
  ) {}

  async getMonthlyForUser(
    userId: string,
    month: string,
    now = new Date(),
  ): Promise<MonthlySummary> {
    const [spending, expected] = await Promise.all([
      this.getSpendingForUser(userId, month, now),
      this.income.getExpectedForUser(userId, month),
    ]);

    return {
      ...spending,
      expectedIncome: expected.totals,
    };
  }

  async getSpendingForUser(userId: string, month: string, now = new Date()) {
    const asOf = now.toISOString();
    const groups = await this.persistence
      .user(userId)
      .transactions.taggedAggregates.query({
        ...monthBounds(month),
        asOf: month === santiagoMonth(now) ? asOf : undefined,
        adjustmentsAsOf: asOf,
      });
    return {
      month,
      ...movementTotals(groups),
      untaggedSpending: movementTotals(groups.filter((row) => row.tag === null))
        .spending,
      asOf,
      adjustmentsAsOf: asOf,
      tags: spendingByTag(groups),
    };
  }

  async getComparisonForUser(
    userId: string,
    month: string,
    now = new Date(),
  ): Promise<MonthlyComparison> {
    const client = this.persistence.user(userId);
    const {
      previousMonth: previous,
      partial,
      current: currentWindow,
      previous: previousWindow,
    } = comparisonPeriods(month, now);
    const [currentGroups, earlierGroups] = await Promise.all([
      client.transactions.aggregates.query({
        ...currentWindow,
        asOf: partial ? now.toISOString() : undefined,
        adjustmentsAsOf: now.toISOString(),
      }),
      client.transactions.aggregates.query({
        ...previousWindow,
        adjustmentsAsOf: now.toISOString(),
      }),
    ]);
    const current = movementTotals(currentGroups);
    const earlier = movementTotals(earlierGroups);

    return {
      month,
      previousMonth: previous,
      partial,
      receivedIncome: {
        current: current.receivedIncome,
        previous: earlier.receivedIncome,
        change: fromCents(
          toCents(current.receivedIncome) - toCents(earlier.receivedIncome),
        ),
      },
      spending: {
        current: current.spending,
        previous: earlier.spending,
        change: fromCents(
          toCents(current.spending) - toCents(earlier.spending),
        ),
      },
      unresolvedMovementCount: {
        current: current.unresolvedMovementCount,
        previous: earlier.unresolvedMovementCount,
      },
    };
  }
}
