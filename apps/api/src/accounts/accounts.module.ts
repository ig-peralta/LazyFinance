import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { AccountsHttpController } from './accounts.http';
import { AccountsMcpController } from './accounts.mcp';
import { AccountsService } from './accounts.service';

@Module({
  imports: [PersistenceModule],
  controllers: [AccountsHttpController, AccountsMcpController],
  providers: [AccountsService],
})
export class AccountsModule {}
