import { Module } from '@nestjs/common';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { AccountsHttpController } from './accounts.http';

@Module({
  imports: [DrizzleModule],
  controllers: [AccountsHttpController],
})
export class AccountsModule {}
