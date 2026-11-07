import type {
  BudgetHistoryInput,
  BudgetVersionInput,
} from "@lazyfinance/contracts";
import type {
  BudgetWriteDefinition,
  CreateBudgetCommand,
  UpdateBudgetCommand,
} from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/postgres";
import { RLS_DB } from "../../database/tokens";
import { toCursorPage } from "../../pagination/cursor-page";
import type { BudgetRevisionTables } from "../budget-revision/budget-revision.tables";
import type { BudgetRevisionTagTables } from "../budget-revision-tag/budget-revision-tag.tables";
import type { TagTables } from "../tag/tag.tables";
import { decodeBudgetCursor, encodeBudgetCursor } from "./budget-cursor";
import { budgetInstant, budgetTimestamp } from "./budget-sql";
import type { ObjectiveTables } from "./objective.tables";

type Tables = ObjectiveTables &
  BudgetRevisionTables &
  BudgetRevisionTagTables &
  TagTables;

@Injectable()
export class BudgetRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<Tables>) {}

  private async ownedBudget(id: string, lock = false) {
    const query = this.db
      .selectFrom("finance.objective")
      .selectAll()
      .select(sql<Date>`clock_timestamp()`.as("observedAt"))
      .select(
        budgetTimestamp(sql.ref<Date | null>("archivedAt")).as(
          "archivalInstant",
        ),
      )
      .where("id", "=", id)
      .where("intent", "=", "spending");
    const row = await (lock ? query.forUpdate() : query).executeTakeFirst();
    if (!row)
      throw new TRPCError({ code: "NOT_FOUND", message: "Budget not found" });

    return row;
  }

  private revisions() {
    return this.db
      .selectFrom("finance.budget_revision as r")
      .select([
        "r.id",
        "r.objectiveId as budgetId",
        "r.version",
        "r.name",
        "r.amount",
        "r.kind",
        "r.isRecurring",
        "r.period",
        budgetTimestamp(sql.ref<Date | null>("r.startDate")).as("startDate"),
        budgetTimestamp(sql.ref<Date | null>("r.endDate")).as("endDate"),
        budgetTimestamp(sql.ref<Date>("r.effectiveFrom")).as("effectiveFrom"),
        budgetTimestamp(sql.ref<Date>("r.recordedAt")).as("recordedAt"),
        budgetTimestamp(sql.ref<Date | null>("r.supersededAt")).as(
          "supersededAt",
        ),
      ])
      .select((eb) =>
        jsonArrayFrom(
          eb
            .selectFrom("finance.budget_revision_tag as l")
            .innerJoin("finance.tag as t", "t.id", "l.tagId")
            .select(["t.id", "t.name", "t.color"])
            .whereRef("l.revisionId", "=", "r.id")
            .orderBy("t.name")
            .orderBy("t.id")
            .limit(50001),
        ).as("tags"),
      );
  }

  async detail(id: string) {
    const row = await this.ownedBudget(id);
    const at = row.archivalInstant
      ? budgetInstant(row.archivalInstant)
      : row.observedAt;
    const effective = await this.revisions()
      .where("r.objectiveId", "=", id)
      .where("r.supersededAt", "is", null)
      .where("r.effectiveFrom", "<=", at)
      .orderBy("r.effectiveFrom", "desc")
      .executeTakeFirst();
    const pending = row.archivedAt
      ? undefined
      : await this.revisions()
          .where("r.objectiveId", "=", id)
          .where("r.supersededAt", "is", null)
          .where("r.effectiveFrom", ">", at)
          .orderBy("r.effectiveFrom")
          .executeTakeFirst();

    return {
      id,
      version: row.budgetVersion,
      archivedAt: row.archivalInstant,
      effective: effective ?? null,
      pending: pending ?? null,
    };
  }

  async history({ id, cursor, limit }: BudgetHistoryInput) {
    await this.ownedBudget(id);
    const boundary = cursor ? decodeBudgetCursor(cursor, id) : null;
    let query = this.revisions().where("r.objectiveId", "=", id);
    if (boundary !== null) query = query.where("r.version", "<", boundary);

    const rows = await query
      .orderBy("r.version", "desc")
      .limit(limit + 1)
      .execute();
    return toCursorPage(rows, limit, (row) =>
      encodeBudgetCursor(id, row.version),
    );
  }

  private async validateTags(ids: string[]) {
    const tags = await this.db
      .selectFrom("finance.tag")
      .select("id")
      .where("id", "in", ids)
      .where("isArchived", "=", false)
      .execute();
    if (tags.length !== ids.length)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Budget tags must be owned and active",
      });
  }

  private async insertRevision(
    id: string,
    version: number,
    budget: BudgetWriteDefinition,
    effectiveFrom: string,
  ) {
    const revision = await this.db
      .insertInto("finance.budget_revision")
      .values({
        objectiveId: id,
        version,
        name: budget.name,
        amount: budget.amount,
        kind: "time_based",
        isRecurring: budget.isRecurring,
        period: budget.period,
        startDate: budgetInstant(budget.startDate),
        endDate: budget.endDate ? budgetInstant(budget.endDate) : null,
        effectiveFrom: budgetInstant(effectiveFrom),
        supersededAt: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await this.db
      .insertInto("finance.budget_revision_tag")
      .values(
        budget.tagIds.map((tagId) => ({ revisionId: revision.id, tagId })),
      )
      .execute();
  }

  async create({ budget }: CreateBudgetCommand) {
    await this.validateTags(budget.tagIds);
    const row = await this.db
      .insertInto("finance.objective")
      .values({
        userId: sql<string>`identity.current_user_id()`,
        name: budget.name,
        amount: budget.amount,
        kind: "time_based",
        intent: "spending",
        isRecurring: budget.isRecurring,
        period: budget.period,
        startDate: budgetInstant(budget.startDate),
        endDate: budget.endDate ? budgetInstant(budget.endDate) : null,
        archivedAt: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await this.insertRevision(row.id, 1, budget, budget.startDate);
    return this.detail(row.id);
  }

  async update(input: UpdateBudgetCommand) {
    const row = await this.ownedBudget(input.id, true);
    if (row.archivedAt)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Archived budgets cannot be changed",
      });
    if (row.budgetVersion !== input.expectedVersion)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Budget version changed",
      });

    const detail = await this.detail(input.id);
    const current = detail.effective ?? detail.pending;
    if (!current || current.kind !== "time_based" || !current.startDate)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Unsupported budget configuration",
      });

    // Revision projections are exact UTC microseconds; the server observation
    // uses milliseconds. Compare equal-width UTC values without rounding bounds.
    const observedAt = row.observedAt.toISOString().replace(/Z$/, "000Z");
    const started = current.startDate <= observedAt;
    if (started !== input.wasStarted)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Budget activation changed; reload before editing",
      });
    if (started) {
      if (
        !current.isRecurring ||
        !["monthly", "yearly"].includes(current.period ?? "") ||
        (current.endDate && current.endDate <= observedAt)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Started fixed or ended budgets cannot be changed",
        });

      const sameSchedule = await this.db
        .selectFrom("finance.budget_revision")
        .select("id")
        .where("id", "=", current.id)
        .where("isRecurring", "=", input.budget.isRecurring)
        .where("period", "=", input.budget.period)
        .where("startDate", "=", budgetInstant(input.budget.startDate))
        .$call((query) =>
          input.budget.endDate === null
            ? query.where("endDate", "is", null)
            : query.where("endDate", "=", budgetInstant(input.budget.endDate)),
        )
        .where(
          sql<boolean>`${budgetInstant(input.effectiveFrom)} > ${row.observedAt}`,
        )
        .executeTakeFirst();
      if (!sameSchedule)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Budget schedule changed or effective boundary expired",
        });
    }

    await this.validateTags(input.budget.tagIds);
    await this.db
      .updateTable("finance.budget_revision")
      .set({ supersededAt: row.observedAt })
      .where("objectiveId", "=", input.id)
      .where("supersededAt", "is", null)
      .$if(started, (query) =>
        query.where("effectiveFrom", ">", row.observedAt),
      )
      .execute();
    await this.insertRevision(
      input.id,
      row.budgetVersion + 1,
      input.budget,
      input.effectiveFrom,
    );
    await this.db
      .updateTable("finance.objective")
      .set({
        budgetVersion: row.budgetVersion + 1,
        updatedAt: row.observedAt,
      })
      .where("id", "=", input.id)
      .execute();
    return this.detail(input.id);
  }

  async archive({ id, expectedVersion }: BudgetVersionInput) {
    const row = await this.ownedBudget(id, true);
    if (row.archivedAt) return this.detail(id);
    if (row.budgetVersion !== expectedVersion)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Budget version changed",
      });

    await this.db
      .updateTable("finance.budget_revision")
      .set({ supersededAt: row.observedAt })
      .where("objectiveId", "=", id)
      .where("supersededAt", "is", null)
      .where("effectiveFrom", ">", row.observedAt)
      .execute();
    await this.db
      .updateTable("finance.objective")
      .set({
        archivedAt: row.observedAt,
        budgetVersion: row.budgetVersion + 1,
        updatedAt: row.observedAt,
      })
      .where("id", "=", id)
      .execute();
    return this.detail(id);
  }
}
