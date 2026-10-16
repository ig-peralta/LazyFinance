import type { AccountSummary } from '@lazyfinance/contracts';
import { Injectable } from '@nestjs/common';
import { AccountRepository } from '../drizzle/repositories/account.repository';

@Injectable()
export class AccountsService {
  constructor(private readonly accounts: AccountRepository) {}

  getActiveForUser(userId: string): Promise<AccountSummary[]> {
    return this.accounts.listActiveForUser(userId);
  }
}
