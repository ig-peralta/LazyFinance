import { Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import type { Kysely } from "kysely";
import { RlsMiddleware } from "../rpc/rls.middleware";
import { createDatabase } from "./connection";
import { assertRuntimeRole } from "./provision";
import { createRlsDbProxy } from "./rls";
import { RLS_DB, RUNTIME_DB } from "./tokens";

@Module({
  providers: [
    RlsMiddleware,
    {
      provide: RUNTIME_DB,
      useFactory: async () => {
        const url = process.env.POSTGRES_RUNTIME_URL;
        if (!url)
          throw new Error(
            "POSTGRES_RUNTIME_URL is required; owner credentials are not runtime credentials",
          );
        if (process.env.POSTGRES_MIGRATION_URL)
          throw new Error(
            "Migration credentials must not be present in the persistence runtime",
          );

        const db = createDatabase(url);

        try {
          await assertRuntimeRole(db);
          return db;
        } catch (error) {
          await db.destroy();
          throw error;
        }
      },
    },
    { provide: RLS_DB, useFactory: () => createRlsDbProxy() },
  ],
  exports: [RLS_DB, RlsMiddleware],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(
    @Inject(RUNTIME_DB)
    private readonly database: Kysely<Record<string, never>>,
  ) {}

  async onModuleDestroy() {
    await this.database.destroy();
  }
}
