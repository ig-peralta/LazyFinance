import type { DemoDataResetResult } from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { DemoToolsDatabase } from "../database/demo-tools.database";
import { resetDemoDataInTransaction } from "../database/seed/demo-data-reset";

@Injectable()
export class DemoToolsService {
  constructor(private readonly tools: DemoToolsDatabase) {}

  async resetDemoData(userId: string): Promise<DemoDataResetResult> {
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
      return resetDemoDataInTransaction(tx, userId);
    });
  }
}
