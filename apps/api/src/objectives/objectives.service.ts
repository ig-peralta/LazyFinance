import type { BudgetProgress, ObjectiveSummary } from '@lazyfinance/contracts';
import { Injectable } from '@nestjs/common';
import { fromCents, toCents } from '../_utils/money';
import { santiagoMonth, santiagoTimestamp } from '../_utils/santiago-time';
import { monthBounds } from '../drizzle/repositories/financial-filters';
import { ObjectiveRepository } from '../drizzle/repositories/objective.repository';
import { TagRepository } from '../drizzle/repositories/tag.repository';
import { TransactionRepository } from '../drizzle/repositories/transaction.repository';
import { budgetPeriod } from './budget-period';

@Injectable()
export class ObjectivesService {
  constructor(
    private readonly objectives: ObjectiveRepository,
    private readonly tags: TagRepository,
    private readonly transactions: TransactionRepository,
  ) {}

  async getForUser(userId: string): Promise<ObjectiveSummary[]> {
    const rows = await this.objectives.listForUser(userId);
    if (rows.length === 0) return [];

    const links = await this.tags.listForObjectives(userId, rows.map(({ id }) => id));
    const tagsByObjective = new Map<string, ObjectiveSummary['tags']>();
    for (const { objectiveId, ...tag } of links) {
      const items = tagsByObjective.get(objectiveId) ?? [];
      items.push(tag);
      tagsByObjective.set(objectiveId, items);
    }

    return rows.map(({ startDate, endDate, ...item }) => ({
      ...item,
      startDate: startDate?.toISOString() ?? null,
      endDate: endDate?.toISOString() ?? null,
      tags: tagsByObjective.get(item.id) ?? [],
    }));
  }

  async getSpendingProgressForUser(userId: string, month: string, now = new Date()): Promise<BudgetProgress[]> {
    const objectives = await this.objectives.listForUser(userId);
    if (objectives.length === 0) return [];
    const links = await this.tags.listForObjectives(userId, objectives.map(({ id }) => id));
    const candidates = objectives.flatMap((objective) => {
      const window = budgetPeriod(objective, month);
      const tagIds = new Set(links.filter((link) => link.objectiveId === objective.id).map(({ id }) => id));
      return window && tagIds.size ? [{ objective, window, tagIds }] : [];
    });
    if (candidates.length === 0) return [];

    const start = candidates.reduce((earliest, item) => item.window.start < earliest ? item.window.start : earliest, candidates[0].window.start);
    const asOf = month === santiagoMonth(now) ? now : undefined;
    const end = monthBounds(month).end;
    const transactions = await (asOf
      ? this.transactions.listTaggedDebitsForPeriod(userId, start, end, asOf)
      : this.transactions.listTaggedDebitsForPeriod(userId, start, end));

    return candidates.map(({ objective, window, tagIds }) => {
      let spent = 0n;
      for (const transaction of transactions) {
        const date = santiagoTimestamp(transaction.bookedAt);
        if (!tagIds.has(transaction.tagId) || date < window.start || date >= window.end) continue;
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
        percentage: Number(spent * 100n / limit),
      };
    });
  }
}
