import type {
  DemoDataResetResult,
  DemoTransactionResult,
} from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { sql, type Transaction } from "kysely";
import type { AssistantTables } from "../assistant/assistant.tables";
import { DemoToolsDatabase } from "../database/demo-tools.database";
import { resetDemoDataInTransaction } from "../database/seed/demo-data-reset";
import { createDemoTransactionInTransaction } from "../database/seed/demo-transaction";
import type { FinanceTables } from "../finance/finance.tables";

@Injectable()
export class DemoToolsService {
  constructor(private readonly tools: DemoToolsDatabase) {}

  async resetDemoData(userId: string): Promise<DemoDataResetResult> {
    return this.run((tx) => resetDemoDataInTransaction(tx, userId));
  }

  async createTransaction(
    userId: string,
    kind: "internal" | "external",
  ): Promise<DemoTransactionResult> {
    return this.run((tx) =>
      createDemoTransactionInTransaction(tx, userId, kind),
    );
  }

  private async run<Result>(
    work: (tx: Transaction<FinanceTables & AssistantTables>) => Promise<Result>,
  ): Promise<Result> {
    const database = this.tools.connection();
    if (!database) throw new TRPCError({ code: "NOT_FOUND" });
    return database.transaction().execute(async (tx) => {
      const {
        rows: [connection],
      } = await sql<{ databaseName: string; roleName: string }>`select
        current_database() as "databaseName", current_user as "roleName"`.execute(
        tx,
      );
      if (
        connection?.databaseName !== process.env.DEMO_TOOLS_DATABASE_NAME ||
        connection.roleName !== process.env.DEMO_TOOLS_DATABASE_USER
      )
        throw new Error("Demo tools database boundary changed");
      return work(tx);
    });
  }
}
