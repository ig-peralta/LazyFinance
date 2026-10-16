import { MonthSchema, type MonthlySummary } from '@lazyfinance/contracts';
import { BadRequestException, Controller, Get, Header, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { SummariesService } from './summaries.service';

@Controller('summaries')
export class SummariesHttpController {
  constructor(private readonly summaries: SummariesService) {}

  @Get('monthly')
  @Header('Cache-Control', 'private, no-store')
  getMonthly(@Req() request: AuthenticatedRequest, @Query('month') month: string): Promise<MonthlySummary> {
    if (!MonthSchema.safeParse(month).success) {
      throw new BadRequestException('month must use YYYY-MM');
    }
    return this.summaries.getMonthlyForUser(request.principal.userId, month);
  }
}
