import { Module } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { BalanceMcpController } from './balance.mcp';

@Module({
  controllers: [
    BalanceMcpController,
  ],
  providers: [
    BalanceService,
  ],
})
export class BalanceModule {}
