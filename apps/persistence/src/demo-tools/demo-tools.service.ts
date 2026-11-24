import type {
  DemoDataResetResult,
  DemoTransactionResult,
} from "@lazyfinance/contracts";
import { DemoBankSourceSchema } from "@lazyfinance/contracts/internal";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { sql, type Transaction } from "kysely";
import type { AssistantTables } from "../assistant/assistant.tables";
import { DemoToolsDatabase } from "../database/demo-tools.database";
import {
  finalizeDemoDataInTransaction,
  resetDemoDataInTransaction,
} from "../database/seed/demo-data-reset";
import { userFixtureId } from "../database/seed/demo-fixture-ids";
import {
  changeDemoMovementInTransaction,
  createDemoTransactionInTransaction,
} from "../database/seed/demo-transaction";
import { demoConnectionId } from "../database/seed/profile";
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

  changeMovement(userId: string, action: "correct" | "remove") {
    return this.run((tx) =>
      changeDemoMovementInTransaction(tx, userId, action),
    );
  }

  preparation(userId: string) {
    return this.run(async (tx) => {
      const row = await tx
        .selectFrom("finance.demo_bank_source")
        .select(["connectionId", "initialMovementCount", "prepared"])
        .where("userId", "=", userId)
        .where("connectionId", "=", userFixtureId(userId, demoConnectionId))
        .executeTakeFirst();
      return row
        ? {
            connectionId: row.connectionId,
            transactionCount: row.initialMovementCount,
            prepared: row.prepared,
          }
        : null;
    });
  }

  finalize(userId: string) {
    return this.run((tx) => finalizeDemoDataInTransaction(tx, userId));
  }

  source(userId: string, connectionId: string) {
    return this.run(async (tx) => {
      const row = await tx
        .selectFrom("finance.demo_bank_source as s")
        .innerJoin("finance.provider_connection as c", "c.id", "s.connectionId")
        .innerJoin("finance.provider as p", "p.id", "c.providerId")
        .select([
          "s.connectionId",
          "s.accounts",
          "s.movements",
          "s.failure",
          "s.prepared",
          "s.updatedAt",
        ])
        .where("s.userId", "=", userId)
        .where("c.userId", "=", userId)
        .where("p.identifier", "=", "mock_bank")
        .where("s.connectionId", "=", connectionId)
        .executeTakeFirst();
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Demo bank not found",
        });
      return DemoBankSourceSchema.parse({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
      });
    });
  }

  history(userId: string, connectionId: string) {
    return this.run(async (tx) => {
      const owned = await tx
        .selectFrom("finance.demo_bank_source")
        .select("connectionId")
        .where("userId", "=", userId)
        .where("connectionId", "=", connectionId)
        .executeTakeFirst();
      if (!owned)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Demo bank not found",
        });
      const rows = await tx
        .selectFrom("finance.demo_bank_sync_event")
        .select([
          "occurredAt",
          "origin",
          "result",
          "movementCount",
          "failureReason",
        ])
        .where("userId", "=", userId)
        .where("connectionId", "=", connectionId)
        .orderBy("occurredAt", "desc")
        .limit(120)
        .execute();
      return rows.map((row) => ({
        ...row,
        occurredAt: row.occurredAt.toISOString(),
      }));
    });
  }

  setFailure(userId: string, failure: "retryable" | "expired" | null) {
    return this.run(async (tx) => {
      const changed = await tx
        .updateTable("finance.demo_bank_source")
        .set({ failure, updatedAt: new Date() })
        .where("userId", "=", userId)
        .where("connectionId", "=", userFixtureId(userId, demoConnectionId))
        .returning("failure")
        .executeTakeFirst();
      if (!changed)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Prepare demo accounts first",
        });
      return changed;
    });
  }

  reconnect(userId: string, connectionId: string) {
    return this.run(async (tx) => {
      await sql`select pg_advisory_xact_lock(hashtextextended(${`lazyfinance:user:${userId}`}, 0))`.execute(
        tx,
      );
      const source = await tx
        .selectFrom("finance.demo_bank_source")
        .select("connectionId")
        .where("userId", "=", userId)
        .where("connectionId", "=", connectionId)
        .executeTakeFirst();
      if (!source)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Demo bank not found",
        });
      const connection = await tx
        .selectFrom("finance.provider_connection")
        .select(["status", "disconnectedAt"])
        .where("userId", "=", userId)
        .where("id", "=", connectionId)
        .executeTakeFirstOrThrow();
      if (connection.disconnectedAt || connection.status !== "expired")
        throw new TRPCError({
          code: "CONFLICT",
          message: "Only expired demo access can be reconnected",
        });
      await tx
        .updateTable("finance.demo_bank_source")
        .set({ failure: null, updatedAt: new Date() })
        .where("connectionId", "=", connectionId)
        .execute();
      await tx
        .updateTable("finance.provider_connection")
        .set({
          status: "active",
          credentialVersion: sql<number>`credential_version + 1`,
          updatedAt: new Date(),
        })
        .where("id", "=", connectionId)
        .execute();
      await tx
        .updateTable("finance.provider_account_selection")
        .set({
          discoveryVersion: 0,
          discoveredAt: null,
          credentialVersion: null,
          accounts: "[]",
          confirmedAt: null,
        })
        .where("connectionId", "=", connectionId)
        .where("userId", "=", userId)
        .execute();
      await tx
        .updateTable("finance.provider_sync_state")
        .set({
          revision: sql<number>`revision + 1`,
          leaseExpiresAt: null,
          retryAfter: null,
        })
        .where("providerConnectionId", "=", connectionId)
        .execute();
      return { status: "active" as const };
    });
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
