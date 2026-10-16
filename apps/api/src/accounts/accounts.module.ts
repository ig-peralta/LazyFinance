import { Module } from '@nestjs/common';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { AccountsHttpController } from './accounts.http';
import { AccountsService } from './accounts.service';

@Module({
  imports: [DrizzleModule],
  controllers: [AccountsHttpController],
  providers: [AccountsService],
})
export class AccountsModule {}
