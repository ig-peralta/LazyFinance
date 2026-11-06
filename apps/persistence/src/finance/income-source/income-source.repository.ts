import type { IncomeSourceInput } from "@lazyfinance/contracts";
import type { PeriodInput } from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";
import type { IncomeExpectationTables } from "../income-expectation/income-expectation.tables";
import type { IncomeReceiptTables } from "../income-receipt/income-receipt.tables";
import { movementPeriod } from "../query-period";
import type { TransactionTables } from "../transaction/transaction.tables";
import type { IncomeSourceTables } from "./income-source.tables";

type Tables = IncomeSourceTables &
  IncomeExpectationTables &
  IncomeReceiptTables &
  TransactionTables;

@Injectable()
export class IncomeSourceRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<Tables>) {}

  sources() {
    return this.db
      .selectFrom("finance.income_source")
      .selectAll()
      .orderBy("createdAt")
      .orderBy("id")
      .limit(10001)
      .execute();
  }

  async source(id: string, lock = false) {
    const query = this.db
      .selectFrom("finance.income_source")
      .selectAll()
      .where("id", "=", id);
    const row = await (lock ? query.forUpdate() : query).executeTakeFirst();
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Income source not found",
      });

    return row;
  }

  create(input: IncomeSourceInput) {
    return this.db
      .insertInto("finance.income_source")
      .values({ ...input, userId: sql<string>`identity.current_user_id()` })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(id: string, input: IncomeSourceInput) {
    const row = await this.source(id, true);
    if (row.archivedAt)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Archived income sources cannot be changed",
      });

    if (row.regularity === "irregular" && input.regularity === "regular") {
      const expectation = await this.db
        .selectFrom("finance.income_expectation")
        .select("id")
        .where("sourceId", "=", id)
        .limit(1)
        .executeTakeFirst();
      if (expectation)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Remove one-off expectations before changing to regular income",
        });
    }

    return this.db
      .updateTable("finance.income_source")
      .set({ ...input, updatedAt: sql<Date>`now()` })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async archive(id: string, at: string) {
    const row = await this.source(id, true);
    if (row.archivedAt) return row;

    return this.db
      .updateTable("finance.income_source")
      .set({ archivedAt: new Date(at), updatedAt: sql<Date>`now()` })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  expectations(period: PeriodInput) {
    return this.db
      .selectFrom("finance.income_expectation")
      .selectAll()
      .where("date", ">=", period.start.slice(0, 10))
      .where("date", "<", period.end.slice(0, 10))
      .orderBy("date")
      .orderBy("id")
      .limit(50001)
      .execute();
  }

  receipts(period: PeriodInput) {
    return this.db
      .selectFrom("finance.income_receipt as r")
      .innerJoin("finance.income_source as s", "s.id", "r.sourceId")
      .innerJoin("finance.transaction as m", "m.id", "r.transactionId")
      .select([
        "r.transactionId",
        "r.sourceId",
        "r.confirmedAt",
        "s.name as sourceName",
        "m.bookedAt",
        "m.amount",
        "m.type",
        "m.isInternalMovement",
        "m.reviewStatus",
        "m.removedAt",
      ])
      .where(movementPeriod(period))
      .orderBy("m.bookedAt")
      .orderBy("m.id")
      .limit(50001)
      .execute();
  }
}
