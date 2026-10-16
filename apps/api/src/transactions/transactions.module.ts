import { Module } from '@nestjs/common';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { TransactionsHttpController } from './transactions.http';
import { TransactionsMcpController } from './transactions.mcp';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [DrizzleModule],
  controllers: [TransactionsHttpController, TransactionsMcpController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
