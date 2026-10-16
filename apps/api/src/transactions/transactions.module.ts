import { Module } from '@nestjs/common';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { TransactionsHttpController } from './transactions.http';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [DrizzleModule],
  controllers: [TransactionsHttpController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
