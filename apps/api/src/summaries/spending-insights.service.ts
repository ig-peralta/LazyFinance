import type {
  MerchantSpendingInput,
  RecurringCandidatesInput,
  SpendingRangeInput,
  SpendingTrendInput,
} from "@lazyfinance/contracts";
import type {
  MerchantSpendingFact,
  TaggedMovementAggregate,
} from "@lazyfinance/contracts/internal";
import { BadRequestException, Injectable } from "@nestjs/common";
import { movementTotals } from "../finance/movement-totals";
import { PersistenceClient } from "../persistence/persistence.client";
import { fromCents, toCents } from "../utils/money";
import { checkedMonth } from "../utils/month-query";
import { monthBounds, previousMonth } from "../utils/period";
import { santiagoMonth, santiagoParts } from "../utils/santiago-time";
import { comparisonPeriods } from "./summaries.service";

function monthsThrough(through: string, length: number) {
  const months = [through];
  for (let index = 1; index < length; index++)
    months.unshift(previousMonth(months[0]));
  return months;
}

function selectedSpending(
  groups: TaggedMovementAggregate[],
  tagId?: string | null,
) {
  return movementTotals(
    tagId === undefined
      ? groups
      : groups.filter(
          (row) =>
            row.tag?.id === tagId || (tagId === null && row.tag === null),
        ),
  ).spending;
}

function merchantAmounts(rows: MerchantSpendingFact[]) {
  let gross = 0n,
    refunds = 0n,
    reimbursements = 0n,
    count = 0;
  for (const row of rows) {
    gross -= toCents(row.amount);
    refunds += toCents(row.refundAmount);
    reimbursements += toCents(row.reimbursementAmount);
    count += row.count;
  }
  return {
    spending: fromCents(gross - refunds - reimbursements),
    grossSpending: fromCents(gross),
    refunds: fromCents(refunds),
    reimbursements: fromCents(reimbursements),
    count,
  };
}

@Injectable()
export class SpendingInsightsService {
  constructor(private readonly persistence: PersistenceClient) {}

  async difference(userId: string, month: string, now = new Date()) {
    const period = checkedMonth(month);
    const asOf = now.toISOString();
    const totals = movementTotals(
      await this.persistence.user(userId).transactions.aggregates.query({
        ...monthBounds(period),
        asOf,
        adjustmentsAsOf: asOf,
      }),
    );
    return {
      month: period,
      ...totals,
      asOf,
      adjustmentsAsOf: asOf,
      difference: fromCents(
        toCents(totals.receivedIncome) - toCents(totals.spending),
      ),
      basis: "confirmed_income_minus_recorded_spending" as const,
    };
  }

  async range(userId: string, input: SpendingRangeInput, now = new Date()) {
    const { year, month, day } = santiagoParts(now);
    const today = `${year}-${month}-${day}`;
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000)
      .toISOString()
      .slice(0, 10);
    const days =
      (Date.parse(`${input.before}T00:00:00Z`) -
        Date.parse(`${input.from}T00:00:00Z`)) /
      86400000;
    if (days < 1 || days > 366 || input.from > today || input.before > tomorrow)
      throw new BadRequestException(
        "Select 1–366 observed Santiago calendar days",
      );
    const asOf = now.toISOString();
    const totals = movementTotals(
      await this.persistence.user(userId).transactions.aggregates.query({
        start: `${input.from} 00:00:00`,
        end: `${input.before} 00:00:00`,
        asOf,
        adjustmentsAsOf: asOf,
      }),
    );
    return {
      from: input.from,
      before: input.before,
      partial: input.before === tomorrow,
      asOf,
      adjustmentsAsOf: asOf,
      ...totals,
    };
  }

  async trend(userId: string, input: SpendingTrendInput, now = new Date()) {
    const through = checkedMonth(input.through ?? santiagoMonth(now));
    const months = monthsThrough(through, input.months);
    const asOf = now.toISOString();
    const rows = await Promise.all(
      months.map(async (month) => {
        const groups = await this.persistence
          .user(userId)
          .transactions.taggedAggregates.query({
            ...monthBounds(month),
            asOf,
            adjustmentsAsOf: asOf,
          });
        return {
          month,
          spending: selectedSpending(groups, input.tagId),
          partial: month === santiagoMonth(now),
          unresolvedMovementCount:
            movementTotals(groups).unresolvedMovementCount,
        };
      }),
    );
    const total = rows.reduce((sum, row) => sum + toCents(row.spending), 0n);
    const length = BigInt(rows.length);
    const average =
      (total + (total >= 0n ? length / 2n : -(length / 2n))) / length;
    return {
      through,
      selection:
        input.tagId === undefined
          ? ("all" as const)
          : input.tagId === null
            ? ("untagged" as const)
            : ("tag" as const),
      tagId: input.tagId ?? null,
      average: fromCents(average),
      asOf,
      months: rows,
    };
  }

  async variation(userId: string, month: string, now = new Date()) {
    const selected = checkedMonth(month);
    const {
      current,
      previous,
      previousMonth: earlier,
      partial,
    } = comparisonPeriods(selected, now);
    const asOf = now.toISOString();
    const client = this.persistence.user(userId).transactions;
    const [currentGroups, previousGroups] = await Promise.all([
      client.taggedAggregates.query({
        ...current,
        asOf,
        adjustmentsAsOf: asOf,
      }),
      client.taggedAggregates.query({
        ...previous,
        asOf,
        adjustmentsAsOf: asOf,
      }),
    ]);
    const byTag = new Map<
      string | null,
      { tagId: string | null; name: string; current: bigint; previous: bigint }
    >();
    for (const [groups, key] of [
      [currentGroups, "current"],
      [previousGroups, "previous"],
    ] as const) {
      for (const row of groups) {
        const id = row.tag?.id ?? null;
        const item = byTag.get(id) ?? {
          tagId: id,
          name: row.tag?.name ?? "Sin etiqueta",
          current: 0n,
          previous: 0n,
        };
        const value = toCents(selectedSpending([row]));
        item[key] += value;
        byTag.set(id, item);
      }
    }
    const all = [...byTag.values()].sort((a, b) => {
      const deltaA = a.current - a.previous,
        deltaB = b.current - b.previous;
      return deltaA === deltaB
        ? a.name.localeCompare(b.name)
        : deltaA > deltaB
          ? -1
          : 1;
    });
    const top = all.slice(0, 12);
    const totalCurrent = toCents(movementTotals(currentGroups).spending);
    const totalPrevious = toCents(movementTotals(previousGroups).spending);
    return {
      month: selected,
      previousMonth: earlier,
      partial,
      asOf,
      current: fromCents(totalCurrent),
      previous: fromCents(totalPrevious),
      change: fromCents(totalCurrent - totalPrevious),
      rows: top.map((row) => ({
        tagId: row.tagId,
        name: row.name,
        current: fromCents(row.current),
        previous: fromCents(row.previous),
        change: fromCents(row.current - row.previous),
      })),
      otherChange: fromCents(
        all
          .slice(12)
          .reduce((sum, row) => sum + row.current - row.previous, 0n),
      ),
    };
  }

  async merchant(
    userId: string,
    input: MerchantSpendingInput,
    now = new Date(),
  ) {
    const month = checkedMonth(input.month ?? santiagoMonth(now));
    const asOf = now.toISOString();
    const facts = await this.persistence
      .user(userId)
      .transactions.merchantSpending.query({
        ...monthBounds(month),
        asOf,
        adjustmentsAsOf: asOf,
      });
    const query = input.merchant?.toLocaleLowerCase("es").trim();
    const selected = query
      ? facts.filter((fact) => fact.merchant?.includes(query))
      : facts;
    const ranked = selected
      .map((fact) => ({ merchant: fact.merchant, ...merchantAmounts([fact]) }))
      .sort((a, b) =>
        toCents(a.spending) === toCents(b.spending)
          ? (a.merchant ?? "").localeCompare(b.merchant ?? "")
          : toCents(a.spending) > toCents(b.spending)
            ? -1
            : 1,
      );
    const totals = merchantAmounts(selected);
    return {
      month,
      merchantQuery: input.merchant ?? null,
      asOf,
      totals,
      merchants: ranked.slice(0, 12),
      merchantGroups: selected.length,
      otherSpending: fromCents(
        toCents(totals.spending) -
          ranked
            .slice(0, 12)
            .reduce((sum, row) => sum + toCents(row.spending), 0n),
      ),
    };
  }

  async recurring(
    userId: string,
    input: RecurringCandidatesInput,
    now = new Date(),
  ) {
    const through = checkedMonth(input.through ?? santiagoMonth(now));
    const months = monthsThrough(through, input.months);
    const asOf = now.toISOString();
    const facts = await this.persistence
      .user(userId)
      .transactions.merchantSpending.query({
        start: monthBounds(months[0]).start,
        end: monthBounds(through).end,
        asOf,
        adjustmentsAsOf: asOf,
      });
    const grouped = new Map<string, MerchantSpendingFact[]>();
    for (const fact of facts) {
      if (
        !fact.merchant ||
        fact.count !== 1 ||
        toCents(merchantAmounts([fact]).spending) <= 0n
      )
        continue;
      grouped.set(fact.merchant, [...(grouped.get(fact.merchant) ?? []), fact]);
    }
    const candidates = [...grouped.entries()]
      .flatMap(([merchant, rows]) => {
        const last = rows.at(-1)?.month;
        if (!last || last < previousMonth(through) || rows.length < 3)
          return [];
        const recent = rows.slice(-3);
        if (
          recent[0].month !== previousMonth(previousMonth(recent[2].month)) ||
          recent[1].month !== previousMonth(recent[2].month)
        )
          return [];
        const amounts = recent.map((row) =>
          toCents(merchantAmounts([row]).spending),
        );
        const min = amounts.reduce((a, b) => (a < b ? a : b));
        const max = amounts.reduce((a, b) => (a > b ? a : b));
        if (min * 6n < max * 5n) return [];
        return [
          {
            merchant,
            observedMonths: rows.length,
            total: merchantAmounts(rows).spending,
            lastObservedMonth: last,
          },
        ];
      })
      .sort((a, b) =>
        toCents(a.total) === toCents(b.total)
          ? a.merchant.localeCompare(b.merchant)
          : toCents(a.total) > toCents(b.total)
            ? -1
            : 1,
      );
    return {
      through,
      months: input.months,
      asOf,
      basis: "observed_merchant_pattern" as const,
      candidates: candidates.slice(0, 12),
      hasMore: candidates.length > 12,
    };
  }
}
