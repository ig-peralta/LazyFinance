import type { TagRuleInput } from "@lazyfinance/contracts";
import type {
  CommitRuleDecisions,
  RuleCandidatesInput,
} from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, type Selectable, sql } from "kysely";
import { fingerprint } from "../../database/fingerprint";
import { RLS_DB } from "../../database/tokens";
import type { AccountTables } from "../account/account.tables";
import type { TagTables } from "../tag/tag.tables";
import { TagDecisionEventRepository } from "../tag-decision-event/tag-decision-event.repository";
import type {
  TransactionTable,
  TransactionTables,
} from "../transaction/transaction.tables";
import type { TagRuleTables } from "./tag-rule.tables";

type Tables = TagRuleTables & TagTables & AccountTables & TransactionTables;

@Injectable()
export class TagRuleRepository {
  constructor(
    @Inject(RLS_DB) private readonly db: Kysely<Tables>,
    private readonly events: TagDecisionEventRepository,
  ) {}
  list() {
    return this.db
      .selectFrom("finance.tag_rule")
      .selectAll()
      .orderBy("createdAt")
      .orderBy("id")
      .limit(10001)
      .execute();
  }
  matchingRules() {
    return this.db
      .selectFrom("finance.tag_rule as r")
      .innerJoin("finance.tag as t", "t.id", "r.tagId")
      .selectAll("r")
      .select("t.name as tagName")
      .where("r.active", "=", true)
      .where("t.isArchived", "=", false)
      .orderBy("r.createdAt")
      .orderBy("r.id")
      .limit(10001)
      .execute();
  }
  async owned(id: string) {
    const rule = await this.db
      .selectFrom("finance.tag_rule")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!rule)
      throw new TRPCError({ code: "NOT_FOUND", message: "Tag rule not found" });
    return rule;
  }
  async create(input: TagRuleInput) {
    await this.targets(input);
    const existing = await this.db
      .selectFrom("finance.tag_rule")
      .selectAll()
      .where("tagId", "=", input.tagId)
      .where(
        "accountId",
        input.accountId === null ? "is" : "=",
        input.accountId,
      )
      .where("direction", "=", input.direction)
      .where("matchField", "=", input.matchField)
      .where("matchValue", "=", input.matchValue)
      .where("active", "=", true)
      .executeTakeFirst();
    if (existing) {
      if (input.autoApply && existing.mode === "suggest") {
        return this.db
          .updateTable("finance.tag_rule")
          .set({
            mode: "auto",
            approvedAt: sql<Date>`now()`,
            updatedAt: sql<Date>`now()`,
          })
          .where("id", "=", existing.id)
          .returningAll()
          .executeTakeFirstOrThrow();
      }
      return existing;
    }
    const { autoApply, ...fields } = input;
    return this.db
      .insertInto("finance.tag_rule")
      .values({
        ...fields,
        userId: sql<string>`identity.current_user_id()`,
        mode: autoApply ? "auto" : "suggest",
        approvedAt: autoApply ? sql<Date>`now()` : null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }
  async replace(id: string, input: TagRuleInput) {
    await this.owned(id);
    await this.targets(input);
    const { autoApply, ...fields } = input;
    return this.db
      .updateTable("finance.tag_rule")
      .set({
        ...fields,
        mode: autoApply ? "auto" : "suggest",
        approvedAt: autoApply ? sql<Date>`now()` : null,
        updatedAt: sql<Date>`now()`,
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
  async archive(id: string) {
    await this.owned(id);
    return this.db
      .updateTable("finance.tag_rule")
      .set({ active: false, updatedAt: sql<Date>`now()` })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
  async facts(id: string) {
    return {
      movement: await this.movement(id),
      rules: await this.matchingRules(),
    };
  }
  async movement(id: string) {
    const movement = await this.db
      .selectFrom("finance.transaction")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!movement)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Transaction not found",
      });
    return movement;
  }
  async manual(transactionId: string, tagId: string | null) {
    const previous = await this.movement(transactionId);
    if (tagId !== null) await this.tag(tagId);
    if (previous.tagDecisionOrigin === "manual" && previous.tagId === tagId)
      return this.decision(previous);
    const row = await this.db
      .updateTable("finance.transaction")
      .set({
        tagId,
        tagDecisionOrigin: "manual",
        tagRuleId: null,
        tagDecidedAt: sql<Date>`now()`,
      })
      .where("id", "=", transactionId)
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.events.record(
      previous,
      tagId,
      tagId === null ? "manual_no_tag" : "manual_tag",
    );
    return this.decision(row);
  }
  async reset(transactionId: string) {
    const previous = await this.movement(transactionId);
    if (previous.tagDecisionOrigin === "unreviewed")
      return this.decision(previous);
    const row = await this.db
      .updateTable("finance.transaction")
      .set({
        tagId: null,
        tagRuleId: null,
        tagDecidedAt: null,
        tagDecisionOrigin: "unreviewed",
      })
      .where("id", "=", transactionId)
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.events.record(previous, null, "reset");
    return this.decision(row);
  }
  async candidates(input: RuleCandidatesInput) {
    const rule = await this.owned(input.ruleId);
    if (!rule.active || rule.mode !== "auto" || rule.approvedAt === null) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Approve an active automatic rule before applying it",
      });
    }
    let query = this.db
      .selectFrom("finance.transaction")
      .selectAll()
      .where("type", "=", rule.direction)
      .where("reviewStatus", "=", "clear")
      .where("removedAt", "is", null)
      .where((eb) =>
        eb.or([
          eb("tagDecisionOrigin", "=", "unreviewed"),
          eb("tagRuleId", "=", rule.id),
        ]),
      );
    if (input.after) query = query.where("id", ">", input.after);
    const movements = await query.orderBy("id").limit(1001).execute();
    const facts = { rule, rules: await this.matchingRules(), movements };
    return { ...facts, fingerprint: fingerprint(facts) };
  }
  async commit(input: CommitRuleDecisions) {
    const facts = await this.candidates(input);
    if (facts.fingerprint !== input.expectedFingerprint)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Tagging inputs changed; read a new candidate batch",
      });
    const candidates = new Map(
      facts.movements.slice(0, 1000).map((row) => [row.id, row]),
    );
    let changed = 0;
    for (const decision of input.decisions) {
      const previous = candidates.get(decision.transactionId);
      if (!previous || previous.tagDecisionOrigin === "manual")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Movement is not an automatic-tag candidate",
        });
      if (await this.applyPrepared(previous, decision, facts.rules)) changed++;
    }
    return { changed };
  }
  /** Called only inside the user write lock, including atomic sync commits. */
  async applyPrepared(
    previous: Selectable<TransactionTable>,
    decision: { tagId: string | null; ruleId: string | null },
    rules: Awaited<ReturnType<TagRuleRepository["matchingRules"]>>,
  ) {
    if (
      previous.tagDecisionOrigin === "manual" ||
      previous.removedAt !== null ||
      (decision.tagId === null) !== (decision.ruleId === null)
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid prepared automatic decision",
      });
    }
    if (decision.ruleId) {
      const rule = rules.find((row) => row.id === decision.ruleId);
      if (
        !rule ||
        rule.tagId !== decision.tagId ||
        rule.mode !== "auto" ||
        !rule.approvedAt ||
        rule.matchField !== "merchant" ||
        rule.direction !== previous.type ||
        (rule.accountId && rule.accountId !== previous.accountId) ||
        previous.isInternalMovement !== false ||
        previous.reviewStatus !== "clear"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Automatic decision is not approved for this movement",
        });
      }
    }
    const origin = decision.ruleId ? "rule" : "unreviewed";
    if (
      previous.tagId === decision.tagId &&
      previous.tagRuleId === decision.ruleId &&
      previous.tagDecisionOrigin === origin
    )
      return false;
    await this.db
      .updateTable("finance.transaction")
      .set({
        tagId: decision.tagId,
        tagRuleId: decision.ruleId,
        tagDecisionOrigin: origin,
        tagDecidedAt: decision.ruleId ? sql<Date>`now()` : null,
      })
      .where("id", "=", previous.id)
      .execute();
    await this.events.record(
      previous,
      decision.tagId,
      previous.tagDecisionOrigin === "rule"
        ? "rule_revalidated"
        : "rule_applied",
      decision.ruleId ?? previous.tagRuleId,
    );
    return true;
  }
  private async tag(id: string) {
    const row = await this.db
      .selectFrom("finance.tag")
      .select("id")
      .where("id", "=", id)
      .where("isArchived", "=", false)
      .executeTakeFirst();
    if (!row)
      throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });
  }
  private async targets(input: TagRuleInput) {
    await this.tag(input.tagId);
    if (
      input.accountId !== null &&
      !(await this.db
        .selectFrom("finance.account")
        .select("id")
        .where("id", "=", input.accountId)
        .executeTakeFirst())
    ) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
    }
  }
  private decision(row: Selectable<TransactionTable>) {
    return {
      transactionId: row.id,
      tagId: row.tagId,
      origin: row.tagDecisionOrigin,
      ruleId: row.tagRuleId,
      decidedAt: row.tagDecidedAt?.toISOString() ?? null,
    };
  }
}
