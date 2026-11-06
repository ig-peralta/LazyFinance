import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { TransactionsHttpController } from './transactions.http';
import { TransactionsMcpController } from './transactions.mcp';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [PersistenceModule],
  controllers: [TransactionsHttpController, TransactionsMcpController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
