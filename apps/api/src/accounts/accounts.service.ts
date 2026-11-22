import type { AccountListItem, SetAccountAlias } from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { coversObservedMonth } from "../finance/history-coverage";
import { movementTotals } from "../finance/movement-totals";
import { PersistenceClient } from "../persistence/persistence.client";
import { checkedMonth } from "../utils/month-query";
import { monthBounds } from "../utils/period";

@Injectable()
export class AccountsService {
  constructor(private readonly persistence: PersistenceClient) {}

  getActiveForUser(userId: string): Promise<AccountListItem[]> {
    return this.persistence.user(userId).accounts.listActive.query();
  }

  async coverageForUser(userId: string, month: string) {
    const selected = checkedMonth(month);
    const asOf = new Date().toISOString();
    const client = this.persistence.user(userId);
    const [accounts, coverage, groups] = await Promise.all([
      this.getActiveForUser(userId),
      client.accounts.coverage.query(),
      client.transactions.aggregates.query({
        ...monthBounds(selected),
        asOf,
        adjustmentsAsOf: asOf,
      }),
    ]);
    const byId = new Map(coverage.map((entry) => [entry.id, entry]));
    const totals = movementTotals(groups);
    return {
      month: selected,
      asOf,
      accounts: accounts.map((account) => {
        const history = byId.get(account.id);
        return {
          id: account.id,
          alias: account.alias,
          type: account.type,
          lastSyncedAt: account.lastSyncedAt,
          trackingStatus: account.trackingStatus,
          historyCompleteness:
            history?.historyCompleteness ?? ("unknown" as const),
          historyFrom: history?.historyFrom ?? null,
          historyThrough: history?.historyThrough ?? null,
          monthCovered: coversObservedMonth(
            history && {
              completeness: history.historyCompleteness,
              from: history.historyFrom,
              through: history.historyThrough,
            },
            selected,
            asOf,
          ),
        };
      }),
      unresolvedMovementCount: totals.unresolvedMovementCount,
      unclassifiedCreditCount: totals.unclassifiedCredits.count,
    };
  }

  setAlias(userId: string, input: SetAccountAlias) {
    return this.persistence.user(userId).accounts.setAlias.mutate(input);
  }
}
