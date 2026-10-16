import type { ObjectiveSummary } from '@lazyfinance/contracts';
import { Controller, Get, Header, Req } from '@nestjs/common';
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
}
