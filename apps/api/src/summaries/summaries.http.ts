import type { MonthlyComparison, MonthlySummary } from '@lazyfinance/contracts';
import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import { checkedMonth } from '../_utils/month-query';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { SummariesService } from './summaries.service';

@Controller('summaries')
export class SummariesHttpController {
  constructor(private readonly summaries: SummariesService) {}

  @Get('monthly')
  @Header('Cache-Control', 'private, no-store')
  getMonthly(@Req() request: AuthenticatedRequest, @Query('month') month: string): Promise<MonthlySummary> {
    return this.summaries.getMonthlyForUser(request.principal.userId, checkedMonth(month));
  }

  @Get('comparison')
  @Header('Cache-Control', 'private, no-store')
  getComparison(@Req() request: AuthenticatedRequest, @Query('month') month: string): Promise<MonthlyComparison> {
    return this.summaries.getComparisonForUser(request.principal.userId, checkedMonth(month));
  }
}
