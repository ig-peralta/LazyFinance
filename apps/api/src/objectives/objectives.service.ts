import type { BudgetProgress, ObjectiveSummary } from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { fromCents, toCents } from "../_utils/money";
import { monthBounds } from "../_utils/period";
import { santiagoMonth, santiagoTimestamp } from "../_utils/santiago-time";
import { PersistenceClient } from "../persistence/persistence.client";
import { budgetPeriod } from "./budget-period";

@Injectable()
export class ObjectivesService {
  constructor(private readonly persistence: PersistenceClient) {}

  async getForUser(userId: string): Promise<ObjectiveSummary[]> {
    const client = this.persistence.user(userId);
    const rows = await client.objectives.list.query();
    if (rows.length === 0) return [];

    const links = await client.objectives.tags.query({
      ids: rows.map(({ id }) => id),
    });
    const tagsByObjective = new Map<string, ObjectiveSummary["tags"]>();

    for (const { objectiveId, ...tag } of links) {
      const items = tagsByObjective.get(objectiveId) ?? [];
      items.push(tag);
      tagsByObjective.set(objectiveId, items);
    }

    return rows.map((item) => ({
      ...item,
      tags: tagsByObjective.get(item.id) ?? [],
    }));
  }

  async getSpendingProgressForUser(
    userId: string,
    month: string,
    now = new Date(),
  ): Promise<BudgetProgress[]> {
    const objectives = await this.getForUser(userId);
    const candidates = objectives.flatMap((objective) => {
      const window = budgetPeriod(objective, month);
      const tagIds = new Set(objective.tags.map(({ id }) => id));

      return window && tagIds.size ? [{ objective, window, tagIds }] : [];
    });
    if (candidates.length === 0) return [];

    const start = candidates.reduce(
      (earliest, item) =>
        item.window.start < earliest ? item.window.start : earliest,
      candidates[0].window.start,
    );
    const asOf = month === santiagoMonth(now) ? now : undefined;
    const end = monthBounds(month).end;
    const transactions = await this.persistence
      .user(userId)
      .transactions.taggedDebits.query({
        start,
        end,
        asOf: asOf?.toISOString(),
      });

    return candidates.map(({ objective, window, tagIds }) => {
      let spent = 0n;

      for (const transaction of transactions) {
        const date = santiagoTimestamp(new Date(transaction.bookedAt));

        if (
          !tagIds.has(transaction.tagId) ||
          date < window.start ||
          date >= window.end
        )
          continue;

        spent -= toCents(transaction.amount);
      }

      const limit = toCents(objective.amount);

      return {
        id: objective.id,
        name: objective.name,
        month,
        period: window.period,
        limit: fromCents(limit),
        spent: fromCents(spent),
        remaining: fromCents(limit - spent),
        percentage: Number((spent * 100n) / limit),
      };
    });
  }
}
