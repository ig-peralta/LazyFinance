import { Module } from '@nestjs/common';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { AccountsHttpController } from './accounts.http';
import { AccountsMcpController } from './accounts.mcp';
import { AccountsService } from './accounts.service';

@Module({
  imports: [DrizzleModule],
  controllers: [AccountsHttpController, AccountsMcpController],
  providers: [AccountsService],
})
export class AccountsModule {}
