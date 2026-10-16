import type { RecentTransaction } from '@lazyfinance/contracts';
import { Controller, Get, Header, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsHttpController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get('recent')
  @Header('Cache-Control', 'private, no-store')
  getRecent(@Req() request: AuthenticatedRequest): Promise<RecentTransaction[]> {
    return this.transactions.getRecentForUser(request.principal.userId);
  }
}
