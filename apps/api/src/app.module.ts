import { Module } from '@nestjs/common';
import { AppHttpController } from './app.http';
import { BalanceModule } from './balance/balance.module';
import { McpModule } from './mcp/mcp.module';
import { ConfigModule } from '@nestjs/config';
import { loadEnv } from './config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [loadEnv],
    }),
    McpModule,
    BalanceModule,
  ],
  controllers: [
    AppHttpController,
  ],
})
export class AppModule {}
