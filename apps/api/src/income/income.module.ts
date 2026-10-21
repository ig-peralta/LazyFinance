import { Module } from '@nestjs/common';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { IncomeHttpController } from './income.http';
import { IncomeMcpController } from './income.mcp';
import { IncomeService } from './income.service';

@Module({
  imports: [DrizzleModule],
  controllers: [IncomeHttpController, IncomeMcpController],
  providers: [IncomeService],
  exports: [IncomeService],
})
export class IncomeModule {}
