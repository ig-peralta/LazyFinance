import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppHttpController } from './app.http';
import { AccountsModule } from './accounts/accounts.module';
import { HttpAuthGuard } from './_guards/http.guard';
import { McpModule } from './mcp/mcp.module';
import { EnvironmentModule } from './environment/environment.module';
import { PersistenceModule } from './persistence/persistence.module';
import { AuthModule } from './auth/auth.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ObjectivesModule } from './objectives/objectives.module';
import { SummariesModule } from './summaries/summaries.module';
import { IncomeModule } from './income/income.module';
import { BankingIngestionModule } from './banking/ingestion/banking-ingestion.module';
import { TaggingModule } from './transactions/tagging/tagging.module';

@Module({
  imports: [
    EnvironmentModule,
    McpModule,
    PersistenceModule,
    AuthModule,
    AccountsModule,
    TransactionsModule,
    ObjectivesModule,
    SummariesModule,
    IncomeModule,
    BankingIngestionModule,
    TaggingModule,
  ],
  controllers: [
    AppHttpController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: HttpAuthGuard },
  ],
})
export class AppModule {}
