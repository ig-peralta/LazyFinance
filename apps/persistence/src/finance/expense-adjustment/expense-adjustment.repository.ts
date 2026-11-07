import type {
  ExpenseAdjustmentPair,
  ExpenseAdjustmentsInput,
  SetExpenseAdjustment,
  TagSummary,
} from "@lazyfinance/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { z } from "zod";
import { RLS_DB } from "../../database/tokens";
import { toCursorPage } from "../../pagination/cursor-page";
import type { IncomeReceiptTables } from "../income-receipt/income-receipt.tables";
import type { TagTables } from "../tag/tag.tables";
import type { TransactionTables } from "../transaction/transaction.tables";
import type { ExpenseAdjustmentTables } from "./expense-adjustment.tables";
import { adjustmentIsValid } from "./expense-adjustment-sql";

type Tables = ExpenseAdjustmentTables &
  TransactionTables &
  IncomeReceiptTables &
  TagTables;

const CursorSchema = z.strictObject({
  version: z.literal(1),
  transactionId: z.uuid(),
  after: z.uuid(),
});

@Injectable()
export class ExpenseAdjustmentRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<Tables>) {}

  private records() {
    return this.db
      .selectFrom("finance.expense_adjustment as x")
      .innerJoin("finance.transaction as p", "p.id", "x.purchaseTransactionId")
      .innerJoin("finance.transaction as c", "c.id", "x.creditTransactionId")
      .leftJoin("finance.tag as t", "t.id", "p.tagId")
      .select([
        "x.id",
        "x.creditTransactionId",
        "x.purchaseTransactionId",
        "x.kind",
        "x.amount",
        sql<string>`to_char(x.confirmed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
          "confirmedAt",
        ),
        sql<string>`to_char(c.booked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
          "creditBookedAt",
        ),
        sql<string>`to_char(p.booked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
          "purchaseBookedAt",
        ),
        sql<TagSummary | null>`CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('id',t.id,'name',t.name,'color',t.color) END`.as(
          "purchaseTag",
        ),
        sql<
          "applied" | "needs_review"
        >`CASE WHEN coalesce((${adjustmentIsValid()}),false) THEN 'applied' ELSE 'needs_review' END`.as(
          "status",
        ),
      ]);
  }

  private async ownedMovements(ids: string[], lock = false) {
    const query = this.db
      .selectFrom("finance.transaction as m")
      .select([
        "m.id",
        "m.amount",
        "m.type",
        "m.isInternalMovement",
        "m.reviewStatus",
        "m.removedAt",
      ])
      .select(
        sql<string>`to_char(m.booked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
          "bookedAt",
        ),
      )
      .select(sql<boolean>`m.booked_at <= statement_timestamp()`.as("isBooked"))
      .where("m.id", "in", ids)
      .orderBy("m.id");
    const rows = await (lock ? query.forUpdate() : query).execute();
    if (rows.length !== ids.length)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Transaction not found",
      });
    return rows;
  }

  async list({ transactionId, cursor, limit }: ExpenseAdjustmentsInput) {
    await this.ownedMovements([transactionId]);
    let query = this.records().where((eb) =>
      eb.or([
        eb("x.creditTransactionId", "=", transactionId),
        eb("x.purchaseTransactionId", "=", transactionId),
      ]),
    );
    if (cursor) {
      try {
        const bytes = Buffer.from(cursor, "base64url");
        if (bytes.toString("base64url") !== cursor)
          throw new Error("Invalid encoding");
        const decoded = CursorSchema.parse(JSON.parse(bytes.toString("utf8")));
        if (decoded.transactionId !== transactionId)
          throw new Error("Selection changed");
        query = query.where("x.id", ">", decoded.after);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Invalid expense adjustment cursor; restart without a cursor",
        });
      }
    }
    const rows = await query
      .orderBy("x.id")
      .limit(limit + 1)
      .execute();
    return toCursorPage(rows, limit, ({ id }) =>
      Buffer.from(
        JSON.stringify({ version: 1, transactionId, after: id }),
      ).toString("base64url"),
    );
  }

  async set(input: SetExpenseAdjustment) {
    const rows = await this.ownedMovements(
      [input.creditTransactionId, input.purchaseTransactionId],
      true,
    );
    const credit = rows.find((row) => row.id === input.creditTransactionId);
    const purchase = rows.find((row) => row.id === input.purchaseTransactionId);
    if (!credit || !purchase) throw new Error("Missing locked movement");
    if (
      credit.type !== "credit" ||
      purchase.type !== "debit" ||
      rows.some(
        (row) =>
          !row.isBooked ||
          row.isInternalMovement !== false ||
          row.reviewStatus !== "clear" ||
          row.removedAt !== null,
      ) ||
      purchase.bookedAt > credit.bookedAt
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Adjustments require a booked external credit and an earlier eligible purchase",
      });

    const receipt = await this.db
      .selectFrom("finance.income_receipt")
      .select("transactionId")
      .where("transactionId", "=", credit.id)
      .executeTakeFirst();
    if (receipt)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Clear the income receipt before linking an expense adjustment",
      });

    // Recheck both capacities under the shared user write lock, including retained
    // allocations currently awaiting review. Never silently trim another decision.
    const capacity = await this.db
      .selectNoFrom(
        sql<boolean>`
      ${input.amount}::numeric + coalesce((SELECT sum(a.amount) FROM finance.expense_adjustment a
        WHERE a.credit_transaction_id = ${credit.id}::uuid AND a.purchase_transaction_id <> ${purchase.id}::uuid),0) <= ${credit.amount}::numeric
      AND ${input.amount}::numeric + coalesce((SELECT sum(a.amount) FROM finance.expense_adjustment a
        WHERE a.purchase_transaction_id = ${purchase.id}::uuid AND a.credit_transaction_id <> ${credit.id}::uuid),0) <= -${purchase.amount}::numeric
    `.as("valid"),
      )
      .executeTakeFirstOrThrow();
    if (!capacity.valid)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Adjustment exceeds the credit or remaining purchase cost",
      });

    await this.db
      .insertInto("finance.expense_adjustment")
      .values({
        creditTransactionId: credit.id,
        purchaseTransactionId: purchase.id,
        kind: input.kind,
        amount: input.amount,
        creditAmount: credit.amount,
        purchaseAmount: purchase.amount,
        creditBookedAt: sql<Date>`${credit.bookedAt}::timestamptz`,
        purchaseBookedAt: sql<Date>`${purchase.bookedAt}::timestamptz`,
        confirmedAt: sql<Date>`clock_timestamp()`,
      })
      .onConflict((oc) =>
        oc
          .columns(["creditTransactionId", "purchaseTransactionId"])
          .doUpdateSet((eb) => ({
            kind: eb.ref("excluded.kind"),
            amount: eb.ref("excluded.amount"),
            creditAmount: eb.ref("excluded.creditAmount"),
            purchaseAmount: eb.ref("excluded.purchaseAmount"),
            creditBookedAt: eb.ref("excluded.creditBookedAt"),
            purchaseBookedAt: eb.ref("excluded.purchaseBookedAt"),
            confirmedAt: sql<Date>`clock_timestamp()`,
          }))
          .where(sql<boolean>`(finance.expense_adjustment.kind,finance.expense_adjustment.amount,
        finance.expense_adjustment.credit_amount,finance.expense_adjustment.purchase_amount,
        finance.expense_adjustment.credit_booked_at,finance.expense_adjustment.purchase_booked_at)
        IS DISTINCT FROM (excluded.kind,excluded.amount,excluded.credit_amount,excluded.purchase_amount,
        excluded.credit_booked_at,excluded.purchase_booked_at)`),
      )
      .execute();
    return this.records()
      .where("x.creditTransactionId", "=", credit.id)
      .where("x.purchaseTransactionId", "=", purchase.id)
      .executeTakeFirstOrThrow();
  }

  async remove(input: ExpenseAdjustmentPair) {
    await this.ownedMovements(
      [input.creditTransactionId, input.purchaseTransactionId],
      true,
    );
    await this.db
      .deleteFrom("finance.expense_adjustment")
      .where("creditTransactionId", "=", input.creditTransactionId)
      .where("purchaseTransactionId", "=", input.purchaseTransactionId)
      .execute();
  }
}
