import {
  FinancialActionContextSchema,
  type FinancialActionRequest,
} from "@lazyfinance/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { fingerprint } from "../database/fingerprint";
import { RLS_DB } from "../database/tokens";
import type { AccountTables } from "../finance/account/account.tables";
import { budgetTimestamp } from "../finance/objective/budget-sql";
import type { TagTables } from "../finance/tag/tag.tables";
import type { TransactionTables } from "../finance/transaction/transaction.tables";
import { wireValue } from "../serialization";

@Injectable()
export class ActionFactsRepository {
  constructor(
    @Inject(RLS_DB)
    private readonly db: Kysely<TagTables & TransactionTables & AccountTables>,
  ) {}

  async preview(action: FinancialActionRequest) {
    const selection =
      action.kind === "create_budget"
        ? action.budget
        : action.kind === "create_savings_goal"
          ? action.goal
          : undefined;
    const ids =
      selection?.tagIds ??
      (action.kind === "update_tag"
        ? [action.tag.id]
        : action.kind === "archive_tag"
          ? [action.id]
          : action.kind === "tag_movement" && action.tagId
            ? [action.tagId]
            : []);
    const names =
      selection?.newTags.map((tag) => tag.name) ??
      (action.kind === "create_tag"
        ? [action.tag.name]
        : action.kind === "update_tag" && action.tag.name
          ? [action.tag.name]
          : []);
    const tags =
      ids.length || names.length
        ? await this.db
            .selectFrom("finance.tag")
            .select([
              "id",
              "name",
              "color",
              "isArchived",
              budgetTimestamp(sql.ref<Date>("updatedAt")).as("revision"),
            ])
            .where((eb) =>
              eb.or([
                ...(ids.length ? [eb("id", "in", ids)] : []),
                ...(names.length ? [eb("name", "in", names)] : []),
              ]),
            )
            .orderBy("id")
            .limit(56)
            .execute()
        : [];
    if (ids.some((id) => !tags.some((tag) => tag.id === id && !tag.isArchived)))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Tags must be owned and active",
      });
    if (
      names.some((name) =>
        tags.some((tag) => tag.name === name && tag.isArchived),
      )
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "An archived tag reserves this name",
      });
    if (
      action.kind === "update_tag" &&
      action.tag.name &&
      tags.some(
        (tag) => tag.name === action.tag.name && tag.id !== action.tag.id,
      )
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Tag name is already reserved",
      });
    const movementId =
      action.kind === "tag_movement" || action.kind === "reset_movement_tag"
        ? action.transactionId
        : undefined;
    const movement = movementId
      ? await this.db
          .selectFrom("finance.transaction as m")
          .innerJoin("finance.account as a", "a.id", "m.accountId")
          .leftJoin("finance.tag as t", "t.id", "m.tagId")
          .select([
            "m.id",
            "m.amount",
            "m.type",
            "m.merchant",
            "m.description",
            "m.tagDecisionOrigin",
            "m.tagRuleId",
            "m.reviewStatus",
            "m.isInternalMovement",
            budgetTimestamp(sql.ref<Date>("m.bookedAt")).as("bookedAt"),
            budgetTimestamp(sql.ref<Date | null>("m.removedAt")).as(
              "removedAt",
            ),
            sql<string>`md5(to_jsonb(m)::text)`.as("revision"),
            budgetTimestamp(sql.ref<Date | null>("m.tagDecidedAt")).as(
              "decisionRevision",
            ),
            sql<{
              id: string;
              name: string;
              color: string | null;
            } | null>`CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('id',t.id,'name',t.name,'color',t.color) END`.as(
              "tag",
            ),
            sql<{
              id: string;
              alias: string | null;
              type: "checking" | "savings" | "credit_card";
              currency: string;
            }>`jsonb_build_object('id',a.id,'alias',a.alias,'type',a.type,'currency',a.currency)`.as(
              "account",
            ),
          ])
          .where("m.id", "=", movementId)
          .executeTakeFirst()
      : null;
    if (movementId && (!movement || movement.removedAt))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Movement must be owned and nonremoved",
      });
    const context = FinancialActionContextSchema.parse(
      wireValue({ tags, movement: movement ?? null }),
    );
    const digest = fingerprint({ action, tags, movement: movement ?? null });
    if (Buffer.byteLength(JSON.stringify(context)) > 24_000)
      throw new TRPCError({
        code: "PAYLOAD_TOO_LARGE",
        message: "Action preview is too large",
      });
    return { action, context, fingerprint: digest };
  }
}
