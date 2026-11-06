import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type { Kysely } from "kysely";
import { RLS_DB } from "../../database/tokens";
import { IncomeSourceRepository } from "../income-source/income-source.repository";
import type { IncomeSourceTables } from "../income-source/income-source.tables";
import type { TransactionTables } from "../transaction/transaction.tables";
import type { IncomeReceiptTables } from "./income-receipt.tables";

@Injectable()
export class IncomeReceiptRepository {
  constructor(
    @Inject(RLS_DB)
    private readonly db: Kysely<
      IncomeReceiptTables & IncomeSourceTables & TransactionTables
    >,
    private readonly sources: IncomeSourceRepository,
  ) {}

  async confirm(transactionId: string, sourceId: string, at: string) {
    await this.sources.source(sourceId, true);
    const movement = await this.movement(transactionId);
    if (
      movement.type !== "credit" ||
      movement.isInternalMovement !== false ||
      movement.reviewStatus !== "clear" ||
      movement.removedAt !== null ||
      movement.bookedAt > new Date(at)
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Received income requires a booked, non-internal credit transaction",
      });
    }

    const existing = await this.db
      .selectFrom("finance.income_receipt")
      .select("sourceId")
      .where("transactionId", "=", transactionId)
      .executeTakeFirst();

    if (existing?.sourceId !== sourceId) {
      await this.db
        .insertInto("finance.income_receipt")
        .values({ transactionId, sourceId, confirmedAt: new Date(at) })
        .onConflict((oc) =>
          oc
            .column("transactionId")
            .doUpdateSet({ sourceId, confirmedAt: new Date(at) }),
        )
        .execute();
    }

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
      .where("r.transactionId", "=", transactionId)
      .executeTakeFirstOrThrow();
  }

  async clear(transactionId: string) {
    await this.movement(transactionId);
    await this.db
      .deleteFrom("finance.income_receipt")
      .where("transactionId", "=", transactionId)
      .execute();
  }

  private async movement(id: string) {
    const row = await this.db
      .selectFrom("finance.transaction")
      .selectAll()
      .where("id", "=", id)
      .forUpdate()
      .executeTakeFirst();
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Transaction not found",
      });

    return row;
  }
}
