import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { SummariesHttpController } from './summaries.http';
import { SummariesMcpController } from './summaries.mcp';
import { SummariesService } from './summaries.service';
import { IncomeModule } from '../income/income.module';

@Module({
  imports: [PersistenceModule, IncomeModule],
  controllers: [SummariesHttpController, SummariesMcpController],
  providers: [SummariesService],
})
export class SummariesModule {}
