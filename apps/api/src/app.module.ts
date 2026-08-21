import { Module } from '@nestjs/common';
import { AppHttpController } from './app.http';
import { AppService } from './app.service';
import { BalanceModule } from './balance/balance.module';
import { McpModule } from './mcp/mcp.module';

@Module({
  imports: [
    McpModule,
    BalanceModule,
  ],
  controllers: [
    AppHttpController,
  ],
  providers: [
    AppService,
  ],
})
export class AppModule {}
