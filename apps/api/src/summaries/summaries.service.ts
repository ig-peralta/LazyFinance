import type {
  MonthlyComparison,
  MonthlySummary,
  TagSummary,
} from "@lazyfinance/contracts";
import type { MovementAggregate } from "@lazyfinance/contracts/internal";
import { Injectable } from "@nestjs/common";
import { fromCents, toCents } from "../_utils/money";
import { monthBounds, previousMonth } from "../_utils/period";
import { santiagoMonth, santiagoParts } from "../_utils/santiago-time";
import { IncomeService } from "../income/income.service";
import { PersistenceClient } from "../persistence/persistence.client";
import { movementTotals } from "../transactions/movement-totals";

function spendingByTag(groups: MovementAggregate[], tags: TagSummary[]) {
  const amounts = new Map<string, { cents: bigint; count: number }>();

  for (const row of groups) {
    if (
      row.tagId === null ||
      row.type !== "debit" ||
      row.isInternalMovement !== false ||
      row.reviewStatus !== "clear"
    )
      continue;

    const total = amounts.get(row.tagId) ?? { cents: 0n, count: 0 };
    total.cents -= toCents(row.amount);
    total.count += row.count;
    amounts.set(row.tagId, total);
  }

  return tags
    .flatMap(({ id, name, color }) => {
      const total = amounts.get(id);
      if (!total) return [];

      return [
        { id, name, color, amount: fromCents(total.cents), count: total.count },
      ];
    })
    .sort((left, right) => {
      const difference = toCents(right.amount) - toCents(left.amount);
      return difference === 0n
        ? left.name.localeCompare(right.name)
        : difference > 0n
          ? 1
          : -1;
    });
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
    const client = this.persistence.user(userId);
    const asOf = month === santiagoMonth(now) ? now.toISOString() : undefined;
    const [groups, tags, expected] = await Promise.all([
      client.transactions.aggregates.query({ ...monthBounds(month), asOf }),
      client.tags.list.query(),
      this.income.getExpectedForUser(userId, month),
    ]);
    const totals = movementTotals(groups);

    return {
      month,
      expectedIncome: expected.totals,
      ...totals,
      tags: spendingByTag(groups, tags),
    };
  }

  async getComparisonForUser(
    userId: string,
    month: string,
    now = new Date(),
  ): Promise<MonthlyComparison> {
    const client = this.persistence.user(userId);
    const previous = previousMonth(month);
    const partial = month === santiagoMonth(now);
    const { day, hour, minute, second } = santiagoParts(now);
    const previousYear = Number(previous.slice(0, 4));
    const previousNumber = Number(previous.slice(5, 7));
    const previousDays = new Date(
      Date.UTC(previousYear, previousNumber, 0),
    ).getUTCDate();
    const previousEnd =
      Number(day) > previousDays
        ? monthBounds(previous).end
        : `${previous}-${day} ${hour}:${minute}:${second}`;
    const [currentGroups, earlierGroups] = await Promise.all([
      client.transactions.aggregates.query({
        ...monthBounds(month),
        asOf: partial ? now.toISOString() : undefined,
      }),
      client.transactions.aggregates.query({
        start: monthBounds(previous).start,
        end: partial ? previousEnd : monthBounds(previous).end,
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
