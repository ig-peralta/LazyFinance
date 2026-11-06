import { Injectable } from "@nestjs/common";
import { fromCents, toCents } from "../_utils/money";
import { monthBounds } from "../_utils/period";
import { PersistenceClient } from "./persistence.client";

@Injectable()
export class TagClient {
  constructor(private readonly persistence: PersistenceClient) {}

  listForObjectives(userId: string, ids: string[]) {
    return this.persistence.user(userId).objectives.tags.query({ ids });
  }

  async sumDebitsByTagForMonth(userId: string, month: string, asOf?: Date) {
    const client = this.persistence.user(userId);
    const [tags, groups] = await Promise.all([
      client.tags.list.query(),
      client.transactions.aggregates.query({
        ...monthBounds(month),
        asOf: asOf?.toISOString(),
      }),
    ]);
    const amounts = new Map<string, { cents: bigint; count: number }>();

    for (const row of groups)
      if (
        row.tagId &&
        row.type === "debit" &&
        row.isInternalMovement === false &&
        row.reviewStatus === "clear"
      ) {
        const total = amounts.get(row.tagId) ?? { cents: 0n, count: 0 };
        total.cents -= toCents(row.amount);
        total.count += row.count;
        amounts.set(row.tagId, total);
      }

    return tags
      .flatMap(({ isArchived: _, ...tag }) => {
        const amount = amounts.get(tag.id);
        return amount
          ? [{ ...tag, amount: fromCents(amount.cents), count: amount.count }]
          : [];
      })
      .sort((a, b) => {
        const diff = toCents(b.amount) - toCents(a.amount);
        return diff === 0n ? a.name.localeCompare(b.name) : diff > 0n ? 1 : -1;
      });
  }
}
