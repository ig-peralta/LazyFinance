import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppHttpController } from './app.http';
import { HttpAuthGuard } from './auth/http-auth.guard';
import { BalanceModule } from './balance/balance.module';
import { McpModule } from './mcp/mcp.module';
import { EnvironmentModule } from './environment/environment.module';
import { DrizzleModule } from './drizzle/drizzle.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    EnvironmentModule,
    McpModule,
    DrizzleModule,
    AuthModule,
    BalanceModule,
  ],
  controllers: [
    AppHttpController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: HttpAuthGuard },
  ],
})
export class AppModule {}
