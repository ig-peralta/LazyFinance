import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { IncomeHttpController } from './income.http';
import { IncomeMcpController } from './income.mcp';
import { IncomeService } from './income.service';

@Module({
  imports: [PersistenceModule],
  controllers: [IncomeHttpController, IncomeMcpController],
  providers: [IncomeService],
  exports: [IncomeService],
})
export class IncomeModule {}
