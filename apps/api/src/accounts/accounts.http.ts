import type { AccountSummary } from '@lazyfinance/contracts';
import { Controller, Get, Header, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { AccountRepository } from '../drizzle/repositories/account.repository';

@Controller('accounts')
export class AccountsHttpController {
  constructor(private readonly accounts: AccountRepository) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  getAccounts(@Req() request: AuthenticatedRequest): Promise<AccountSummary[]> {
    return this.accounts.listActiveForUser(request.principal.userId);
  }
}
