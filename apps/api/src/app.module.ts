import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TRPCModule } from "nestjs-trpc";
import { AccountsModule } from "./accounts/accounts.module";
import { AppHttpController } from "./app.http";
import { AuthModule } from "./auth/auth.module";
import { HttpAuthGuard } from "./auth/http.guard";
import { BankingIngestionModule } from "./banking/ingestion/banking-ingestion.module";
import { EnvironmentModule } from "./environment/environment.module";
import { IncomeModule } from "./income/income.module";
import { McpModule } from "./mcp/mcp.module";
import { ObjectivesModule } from "./objectives/objectives.module";
import { ApiContext } from "./rpc/api.context";
import { ApiMiddleware } from "./rpc/api.middleware";
import { SummariesModule } from "./summaries/summaries.module";
import { TaggingModule } from "./transactions/tagging/tagging.module";
import { TransactionsModule } from "./transactions/transactions.module";

@Module({
  imports: [
    EnvironmentModule,
    McpModule,
    AuthModule,
    AccountsModule,
    TransactionsModule,
    ObjectivesModule,
    SummariesModule,
    IncomeModule,
    BankingIngestionModule,
    TaggingModule,
    TRPCModule.forRoot({
      basePath: "/trpc",
      context: ApiContext,
      globalMiddlewares: [ApiMiddleware],
      trpc: {
        maxBatchSize: 10,
        responseMeta: () => ({
          headers: { "cache-control": "private, no-store" },
        }),
        errorFormatter: ({ shape }) => ({
          ...shape,
          data: { ...shape.data, stack: undefined },
        }),
      },
    }),
  ],
  controllers: [AppHttpController],
  providers: [
    ApiContext,
    ApiMiddleware,
    { provide: APP_GUARD, useClass: HttpAuthGuard },
  ],
})
export class AppModule {}
