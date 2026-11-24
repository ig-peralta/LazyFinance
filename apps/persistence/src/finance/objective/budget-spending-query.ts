import type { ObjectiveSpendingInput } from "@lazyfinance/contracts/internal";
import { type Kysely, sql } from "kysely";
import type { AccountTables } from "../account/account.tables";
import type { BudgetRevisionTables } from "../budget-revision/budget-revision.tables";
import type { BudgetRevisionTagTables } from "../budget-revision-tag/budget-revision-tag.tables";
import { withExpenseRecoveries } from "../expense-adjustment/expense-adjustment-sql";
import type { ObjectiveTagTables } from "../objective-tag/objective-tag.tables";
import { eligibleSpending } from "../spending-evidence/spending-sql";
import type { TagTables } from "../tag/tag.tables";
import type { TransactionTables } from "../transaction/transaction.tables";
import { budgetInstant } from "./budget-sql";
import type { ObjectiveTables } from "./objective.tables";

export type BudgetSpendingTables = ObjectiveTables &
  ObjectiveTagTables &
  BudgetRevisionTables &
  BudgetRevisionTagTables &
  TagTables &
  TransactionTables &
  AccountTables;

export function budgetSpendingBounds() {
  return {
    start: sql.ref<Date>("b.start"),
    end: sql.ref<Date>("b.end"),
  };
}

/** Preserve zero parents, exact activation/archive bounds and revision selection. */
export function budgetSpendingQuery(
  db: Kysely<BudgetSpendingTables>,
  {
    windows,
    asOf,
    adjustmentsAsOf,
  }: Pick<ObjectiveSpendingInput, "windows" | "asOf" | "adjustmentsAsOf">,
) {
  const requested = sql<{
    id: string;
    revisionId: string;
    start: string;
    end: string;
  }>`(SELECT * FROM (VALUES ${sql.join(windows.map((window) => sql`(${window.id}::uuid,${window.revisionId}::uuid,${window.start}::text,${window.end}::text)`))}) AS requested(id, revision_id, start, "end"))`;
  const start = sql<Date>`greatest(${budgetInstant(sql.ref<string>("w.start"))},CASE WHEN r.id IS NULL THEN o.start_date ELSE r.start_date END,r.effective_from)`;
  const end = sql<Date>`least(${budgetInstant(sql.ref<string>("w.end"))},o.archived_at,CASE WHEN r.id IS NULL THEN o.end_date ELSE r.end_date END)`;
  return withExpenseRecoveries(db, adjustmentsAsOf)
    .with(
      (cte) => cte("budget_windows").materialized(),
      () => requested,
    )
    .with(
      (cte) => cte("budget_scopes").materialized(),
      (eb) =>
        eb
          .selectFrom("budget_windows as w")
          .innerJoin("finance.objective as o", "o.id", "w.id")
          .leftJoin("finance.budget_revision as r", (join) =>
            join
              .onRef("r.id", "=", "w.revisionId")
              .onRef("r.objectiveId", "=", "o.id"),
          )
          .where("o.intent", "=", "spending")
          .where(sql<boolean>`((r.id IS NOT NULL AND r.superseded_at IS NULL) OR
          (w.revision_id=o.id AND NOT EXISTS (SELECT 1 FROM finance.budget_revision v WHERE v.objective_id=o.id)))`)
          .where(sql<boolean>`${start} < ${end}`)
          .select([
            "o.id",
            "w.revisionId",
            "r.id as selectedRevisionId",
            "o.archivedAt",
            start.as("start"),
            end.as("end"),
          ]),
    )
    .with(
      (cte) => cte("budget_tags").materialized(),
      () => sql<{
        objectiveId: string;
        revisionId: string | null;
        tagId: string;
      }>`(SELECT b.id AS objective_id,l.revision_id,l.tag_id FROM budget_scopes b
      JOIN finance.budget_revision_tag l ON l.revision_id=b.selected_revision_id
      UNION ALL
      SELECT b.id,NULL::uuid,l.tag_id FROM budget_scopes b
      JOIN finance.objective_tag l ON l.objective_id=b.id
      WHERE b.selected_revision_id IS NULL)`,
    )
    .selectFrom("budget_scopes as b")
    .leftJoin(
      (eb) =>
        eb
          .selectFrom("finance.transaction as owned")
          .innerJoin(
            "finance.account as ownerAccount",
            "ownerAccount.id",
            "owned.accountId",
          )
          .selectAll("owned")
          .where(
            "ownerAccount.userId",
            "=",
            sql<string>`(select identity.current_user_id())`,
          )
          .as("m"),
      (join) =>
        join
          .on(sql<boolean>`m.booked_at >= b.start AND m.booked_at < b.end`)
          .on(eligibleSpending())
          .on(
            asOf
              ? sql<boolean>`m.booked_at <= ${asOf}::timestamptz`
              : sql<boolean>`true`,
          )
          .on(sql<boolean>`EXISTS (SELECT 1 FROM budget_tags selected
          WHERE selected.objective_id=b.id AND selected.revision_id IS NOT DISTINCT FROM b.selected_revision_id
          AND selected.tag_id=m.tag_id)`),
    );
}
