import { Module } from '@nestjs/common';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { SummariesHttpController } from './summaries.http';
import { SummariesMcpController } from './summaries.mcp';
import { SummariesService } from './summaries.service';
import { IncomeModule } from '../income/income.module';

@Module({
  imports: [DrizzleModule, IncomeModule],
  controllers: [SummariesHttpController, SummariesMcpController],
  providers: [SummariesService],
})
export class SummariesModule {}
