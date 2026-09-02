import { Module } from '@nestjs/common';
import { AppHttpController } from './app.http';
import { BalanceModule } from './balance/balance.module';
import { McpModule } from './mcp/mcp.module';
import { EnvironmentModule } from './environment/environment.module';
import { DrizzleModule } from './drizzle/drizzle.module';

@Module({
  imports: [
    EnvironmentModule,
    McpModule,
    DrizzleModule,
    BalanceModule,
  ],
  controllers: [
    AppHttpController,
  ],
})
export class AppModule {}
