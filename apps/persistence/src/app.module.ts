import { Module } from "@nestjs/common";
import { TRPCModule } from "nestjs-trpc";
import { AssistantModule } from "./assistant/assistant.module";
import { DatabaseModule } from "./database/database.module";
import { FinanceModule } from "./finance/finance.module";
import { HealthHttp } from "./health.http";
import { IdentityModule } from "./identity/identity.module";
import { PersistenceContext } from "./rpc/persistence.context";
import { RlsMiddleware } from "./rpc/rls.middleware";

@Module({
  imports: [
    DatabaseModule,
    FinanceModule,
    IdentityModule,
    AssistantModule,
    TRPCModule.forRoot({
      basePath: "/trpc",
      context: PersistenceContext,
      globalMiddlewares: [RlsMiddleware],
      trpc: {
        allowMethodOverride: true,
        maxBatchSize: 1,
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
  providers: [PersistenceContext],
  controllers: [HealthHttp],
})
export class AppModule {}
