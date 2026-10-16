import type { AccountSummary } from '@lazyfinance/contracts';
import { Controller, Get, Header, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { AccountsService } from './accounts.service';

@Controller('accounts')
export class AccountsHttpController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  getAccounts(@Req() request: AuthenticatedRequest): Promise<AccountSummary[]> {
    return this.accounts.getActiveForUser(request.principal.userId);
  }
}
