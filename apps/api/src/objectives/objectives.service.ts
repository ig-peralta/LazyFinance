import type { BudgetProgress, ObjectiveSummary } from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { fromCents, toCents } from "../_utils/money";
import { santiagoMonth } from "../_utils/santiago-time";
import { PersistenceClient } from "../persistence/persistence.client";
import { budgetPeriod } from "./budget-period";

@Injectable()
export class ObjectivesService {
  constructor(private readonly persistence: PersistenceClient) {}

  getForUser(userId: string): Promise<ObjectiveSummary[]> {
    return this.persistence.user(userId).objectives.list.query();
  }

  async getSpendingProgressForUser(
    userId: string,
    month: string,
    now = new Date(),
  ): Promise<BudgetProgress[]> {
    const objectives = await this.getForUser(userId);
    const candidates = objectives.flatMap((objective) => {
      const window = budgetPeriod(objective, month);
      return window && objective.tags.length ? [{ objective, window }] : [];
    });
    if (candidates.length === 0) return [];

    const totals = await this.persistence
      .user(userId)
      .objectives.spending.query({
        windows: candidates.map(({ objective, window }) => ({
          id: objective.id,
          start: window.start,
          end: window.end,
        })),
        asOf: month === santiagoMonth(now) ? now.toISOString() : undefined,
      });
    const amounts = new Map(totals.map(({ id, amount }) => [id, amount]));

    return candidates.flatMap(({ objective, window }) => {
      const amount = amounts.get(objective.id);
      // An objective removed between the two reads is no longer reportable.
      if (amount === undefined) return [];
      const spent = -toCents(amount);
      const limit = toCents(objective.amount);

      return [
        {
          id: objective.id,
          name: objective.name,
          month,
          period: window.period,
          limit: fromCents(limit),
          spent: fromCents(spent),
          remaining: fromCents(limit - spent),
          percentage: Number((spent * 100n) / limit),
        },
      ];
    });
  }
}
