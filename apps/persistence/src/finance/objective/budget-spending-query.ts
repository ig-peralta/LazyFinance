import type { ObjectiveSpendingInput } from "@lazyfinance/contracts/internal";
import { type Kysely, sql } from "kysely";
import type { AccountTables } from "../account/account.tables";
import type { BudgetRevisionTables } from "../budget-revision/budget-revision.tables";
import type { BudgetRevisionTagTables } from "../budget-revision-tag/budget-revision-tag.tables";
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
    start: sql<Date>`greatest(${budgetInstant(sql.ref<string>("w.start"))},CASE WHEN r.id IS NULL THEN o.start_date ELSE r.start_date END,r.effective_from)`,
    end: sql<Date>`least(${budgetInstant(sql.ref<string>("w.end"))},o.archived_at,CASE WHEN r.id IS NULL THEN o.end_date ELSE r.end_date END)`,
  };
}

/** Preserve zero parents, exact activation/archive bounds and revision selection. */
export function budgetSpendingQuery(
  db: Kysely<BudgetSpendingTables>,
  { windows, asOf }: Pick<ObjectiveSpendingInput, "windows" | "asOf">,
) {
  const requested = sql<{
    id: string;
    revisionId: string;
    start: string;
    end: string;
  }>`jsonb_to_recordset(${JSON.stringify(windows.map(({ revisionId, ...window }) => ({ ...window, revision_id: revisionId })))}::jsonb)`.as<"w">(
    sql`w(id uuid, revision_id uuid, start text, "end" text)`,
  );
  const { start, end } = budgetSpendingBounds();
  return db
    .selectFrom(requested)
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
    .leftJoin("finance.transaction as m", (join) =>
      join
        .on(sql<boolean>`m.booked_at >= ${start} AND m.booked_at < ${end}`)
        .on(eligibleSpending())
        .on(
          asOf
            ? sql<boolean>`m.booked_at <= ${asOf}::timestamptz`
            : sql<boolean>`true`,
        )
        .on(sql<boolean>`((r.id IS NOT NULL AND EXISTS (SELECT 1 FROM finance.budget_revision_tag l WHERE l.revision_id=r.id AND l.tag_id=m.tag_id))
        OR (r.id IS NULL AND EXISTS (SELECT 1 FROM finance.objective_tag l WHERE l.objective_id=o.id AND l.tag_id=m.tag_id)))`),
    );
}
