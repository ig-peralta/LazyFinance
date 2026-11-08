import type {
  SavingsGoalVersion,
  SavingsHistoryInput,
} from "@lazyfinance/contracts";
import type {
  CreateSavingsCommand,
  SavingsWriteDefinition,
  UpdateSavingsCommand,
} from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/postgres";
import { z } from "zod";
import { RLS_DB } from "../../database/tokens";
import { toCursorPage } from "../../pagination/cursor-page";
import { budgetInstant, budgetTimestamp } from "../objective/budget-sql";
import type {
  ObjectiveTable,
  ObjectiveTables,
} from "../objective/objective.tables";
import type { ObjectiveTagTables } from "../objective-tag/objective-tag.tables";
import type { TagTables } from "../tag/tag.tables";
import type { SavingsGoalTables } from "./savings-goal.tables";

type Tables = SavingsGoalTables &
  ObjectiveTables &
  ObjectiveTagTables &
  TagTables;
const cursorSchema = z.strictObject({
  version: z.literal(1),
  goalId: z.uuid(),
  revision: z.number().int().positive(),
});

@Injectable()
export class SavingsGoalRepository {
  constructor(@Inject(RLS_DB) private readonly db: Kysely<Tables>) {}

  async owned(id: string, lock = false) {
    const query = this.db
      .selectFrom("finance.objective")
      .selectAll()
      .where("id", "=", id)
      .where("intent", "=", "saving");
    const row = await (lock ? query.forUpdate() : query).executeTakeFirst();
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Savings goal not found",
      });
    return row;
  }

  private revisions() {
    return this.db
      .selectFrom("finance.savings_revision as r")
      .select([
        "r.id",
        "r.objectiveId as goalId",
        "r.version",
        "r.name",
        "r.amount",
        "r.kind",
        "r.isRecurring",
        "r.period",
        budgetTimestamp(sql.ref<Date | null>("r.startDate")).as("startDate"),
        budgetTimestamp(sql.ref<Date | null>("r.endDate")).as("endDate"),
        budgetTimestamp(sql.ref<Date>("r.recordedAt")).as("recordedAt"),
      ])
      .select((eb) =>
        jsonArrayFrom(
          eb
            .selectFrom("finance.savings_revision_tag as l")
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
    const goal = await this.owned(id);
    const revision = await this.revisions()
      .where("r.objectiveId", "=", id)
      .orderBy("r.version", "desc")
      .executeTakeFirst();
    const baseline = await this.db
      .selectFrom("finance.objective as o")
      .select([
        "o.id",
        "o.name",
        "o.amount",
        "o.kind",
        "o.isRecurring",
        "o.period",
        budgetTimestamp(sql.ref<Date | null>("o.startDate")).as("startDate"),
        budgetTimestamp(sql.ref<Date | null>("o.endDate")).as("endDate"),
        budgetTimestamp(sql.ref<Date | null>("o.archivedAt")).as("archivedAt"),
      ])
      .select((eb) =>
        jsonArrayFrom(
          eb
            .selectFrom("finance.objective_tag as l")
            .innerJoin("finance.tag as t", "t.id", "l.tagId")
            .select(["t.id", "t.name", "t.color"])
            .whereRef("l.objectiveId", "=", "o.id")
            .orderBy("t.name")
            .orderBy("t.id")
            .limit(50001),
        ).as("tags"),
      )
      .where("o.id", "=", id)
      .executeTakeFirstOrThrow();
    return {
      ...baseline,
      intent: "saving" as const,
      version: goal.goalVersion,
      revisionId: revision?.id ?? id,
    };
  }

  async history({ id, cursor, limit }: SavingsHistoryInput) {
    await this.owned(id);
    let query = this.revisions().where("r.objectiveId", "=", id);
    if (cursor) {
      try {
        const bytes = Buffer.from(cursor, "base64url");
        if (bytes.toString("base64url") !== cursor)
          throw new Error("Invalid encoding");
        const boundary = cursorSchema.parse(JSON.parse(bytes.toString("utf8")));
        if (boundary.goalId !== id) throw new Error("Goal changed");
        query = query.where("r.version", "<", boundary.revision);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid savings history cursor",
        });
      }
    }
    return toCursorPage(
      await query
        .orderBy("r.version", "desc")
        .limit(limit + 1)
        .execute(),
      limit,
      (row) =>
        Buffer.from(
          JSON.stringify({ version: 1, goalId: id, revision: row.version }),
        ).toString("base64url"),
    );
  }

  private async validateTags(ids: string[], retained: string[] = []) {
    const tags = await this.db
      .selectFrom("finance.tag")
      .select(["id", "isArchived"])
      .where("id", "in", ids)
      .execute();
    const previous = new Set(retained);
    if (
      tags.length !== ids.length ||
      tags.some((tag) => tag.isArchived && !previous.has(tag.id))
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Goal tags must be owned; newly selected tags must be active",
      });
  }

  private async revision(
    id: string,
    version: number,
    goal: Omit<SavingsWriteDefinition, "period"> & {
      period: ObjectiveTable["period"];
    },
  ) {
    const { tagIds } = goal;
    const row = await this.db
      .insertInto("finance.savings_revision")
      .values({
        name: goal.name,
        amount: goal.amount,
        kind: goal.kind,
        isRecurring: goal.isRecurring,
        period: goal.period,
        objectiveId: id,
        version,
        startDate: goal.startDate ? budgetInstant(goal.startDate) : null,
        endDate: goal.endDate ? budgetInstant(goal.endDate) : null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await this.db
      .insertInto("finance.savings_revision_tag")
      .values(tagIds.map((tagId) => ({ revisionId: row.id, tagId })))
      .execute();
  }

  async create({ goal }: CreateSavingsCommand) {
    await this.validateTags(goal.tagIds);
    const { tagIds, ...fields } = goal;
    const row = await this.db
      .insertInto("finance.objective")
      .values({
        ...fields,
        userId: sql<string>`identity.current_user_id()`,
        intent: "saving",
        archivedAt: null,
        startDate: goal.startDate ? budgetInstant(goal.startDate) : null,
        endDate: goal.endDate ? budgetInstant(goal.endDate) : null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await this.db
      .insertInto("finance.objective_tag")
      .values(tagIds.map((tagId) => ({ objectiveId: row.id, tagId })))
      .execute();
    await this.revision(row.id, 1, goal);
    return this.detail(row.id);
  }

  async update({ id, expectedVersion, goal }: UpdateSavingsCommand) {
    const row = await this.owned(id, true);
    if (row.archivedAt)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Archived savings goals cannot be edited",
      });
    if (row.goalVersion !== expectedVersion)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Savings goal version changed",
      });
    const current = await this.detail(id);
    await this.validateTags(
      goal.tagIds,
      current.tags.map((tag) => tag.id),
    );
    // Owner-only seed tooling may add a legacy declaration after the migration.
    if (
      !(await this.revisions()
        .where("r.objectiveId", "=", id)
        .executeTakeFirst())
    )
      await this.revision(id, row.goalVersion, {
        ...current,
        tagIds: current.tags.map((tag) => tag.id),
      });
    const { tagIds, ...fields } = goal;
    await this.db
      .updateTable("finance.objective")
      .set({
        ...fields,
        goalVersion: expectedVersion + 1,
        updatedAt: sql<Date>`clock_timestamp()`,
        startDate: goal.startDate ? budgetInstant(goal.startDate) : null,
        endDate: goal.endDate ? budgetInstant(goal.endDate) : null,
      })
      .where("id", "=", id)
      .execute();
    await this.db
      .deleteFrom("finance.objective_tag")
      .where("objectiveId", "=", id)
      .execute();
    await this.db
      .insertInto("finance.objective_tag")
      .values(tagIds.map((tagId) => ({ objectiveId: id, tagId })))
      .execute();
    await this.revision(id, expectedVersion + 1, goal);
    return this.detail(id);
  }

  async archive({ id, expectedVersion }: SavingsGoalVersion) {
    const row = await this.owned(id, true);
    if (row.archivedAt) return this.detail(id);
    if (row.goalVersion !== expectedVersion)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Savings goal version changed",
      });

    if (
      !(await this.revisions()
        .where("r.objectiveId", "=", id)
        .executeTakeFirst())
    ) {
      const current = await this.detail(id);
      await this.revision(id, row.goalVersion, {
        ...current,
        tagIds: current.tags.map((tag) => tag.id),
      });
    }
    await this.db
      .updateTable("finance.objective")
      .set({
        archivedAt: sql<Date>`clock_timestamp()`,
        updatedAt: sql<Date>`clock_timestamp()`,
        goalVersion: expectedVersion + 1,
      })
      .where("id", "=", id)
      .execute();
    return this.detail(id);
  }
}
