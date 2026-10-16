import { MonthSchema, type BudgetProgress, type ObjectiveSummary } from '@lazyfinance/contracts';
import { BadRequestException, Controller, Get, Header, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ObjectivesService } from './objectives.service';

@Controller('objectives')
export class ObjectivesHttpController {
  constructor(private readonly objectives: ObjectivesService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  getObjectives(@Req() request: AuthenticatedRequest): Promise<ObjectiveSummary[]> {
    return this.objectives.getForUser(request.principal.userId);
  }

  @Get('spending-progress')
  @Header('Cache-Control', 'private, no-store')
  getSpendingProgress(@Req() request: AuthenticatedRequest, @Query('month') month: string): Promise<BudgetProgress[]> {
    if (!MonthSchema.safeParse(month).success) throw new BadRequestException('month must use YYYY-MM');
    return this.objectives.getSpendingProgressForUser(request.principal.userId, month);
  }
}
