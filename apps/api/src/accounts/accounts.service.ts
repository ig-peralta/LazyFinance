import type { AccountSummary } from '@lazyfinance/contracts';
import { Injectable } from '@nestjs/common';
import { AccountRepository } from '../drizzle/repositories/account.repository';

@Injectable()
export class AccountsService {
  constructor(private readonly accounts: AccountRepository) {}

  async getActiveForUser(userId: string): Promise<AccountSummary[]> {
    const rows = await this.accounts.listActiveForUser(userId);
    return rows.map(({ lastSyncedAt, ...item }) => ({
      ...item,
      lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
    }));
  }
}
