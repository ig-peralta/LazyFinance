import {
  ASSISTANT_MAX_TURNS,
  type AssistantTurn,
  CreateAssistantConversationSchema,
} from "@lazyfinance/contracts";
import {
  type BeginAssistantTurn,
  type FinishAssistantTurn,
  type RecordAssistantVoiceQuestion,
  StoredAssistantConversationSchema,
} from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, type Selectable, sql } from "kysely";
import type { z } from "zod";
import { ActionRepository } from "../actions/action.repository";
import { RLS_DB } from "../database/tokens";
import { wireValue } from "../serialization";
import type { AssistantTables } from "./assistant.tables";

const summaryFields = [
  "id",
  "title",
  "createdAt",
  "updatedAt",
  "expiresAt",
] as const;

@Injectable()
export class AssistantRepository {
  constructor(
    @Inject(RLS_DB) private readonly db: Kysely<AssistantTables>,
    private readonly actions: ActionRepository,
  ) {}

  async list() {
    const rows = await this.db
      .selectFrom("assistant.conversation")
      .select([
        ...summaryFields,
        sql<number>`jsonb_array_length(jsonb_path_query_array(turns, '$[*] ? (!exists(@.voice) && @.question != "Consulta por voz")'))`.as(
          "turnCount",
        ),
      ])
      .where("mode", "=", "text")
      .where("expiresAt", ">", sql<Date>`clock_timestamp()`)
      .orderBy("updatedAt", "desc")
      .limit(10)
      .execute();
    return wireValue(rows);
  }

  async create({ mode }: z.infer<typeof CreateAssistantConversationSchema>) {
    await this.db
      .deleteFrom("assistant.conversation")
      .where("expiresAt", "<=", sql<Date>`clock_timestamp()`)
      .execute();
    const count = await this.db
      .selectFrom("assistant.conversation")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("mode", "=", mode)
      .executeTakeFirstOrThrow();
    if (count.count >= (mode === "voice" ? 100 : 10))
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message:
          mode === "voice"
            ? "Voice session storage limit reached"
            : "Delete an existing conversation before creating another",
      });
    const row = await this.db
      .insertInto("assistant.conversation")
      .values({
        userId: sql<string>`identity.current_user_id()`,
        mode,
        lease: null,
        leaseExpiresAt: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.snapshot(row);
  }

  private async owned(id: string, lock = false) {
    let query = this.db
      .selectFrom("assistant.conversation")
      .selectAll()
      .select(sql<number>`octet_length(turns::text)`.as("storedBytes"))
      .where("id", "=", id)
      .where("expiresAt", ">", sql<Date>`clock_timestamp()`);
    if (lock) query = query.forUpdate();
    const row = await query.executeTakeFirst();
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Conversation is unavailable",
      });
    return row;
  }

  private async snapshot(
    row: Selectable<AssistantTables["assistant.conversation"]>,
  ) {
    const actions = row.turns.some((turn) => turn.actions.length)
      ? await this.actions.listForConversation(row.id)
      : [];
    const byId = new Map(actions.map((action) => [action.id, action]));
    const turns = row.turns.map((turn) => ({
      ...turn,
      status:
        turn.status === "pending" &&
        (!row.leaseExpiresAt || row.leaseExpiresAt.getTime() <= Date.now())
          ? ("interrupted" as const)
          : turn.status,
      actions: turn.actions.map((action) => {
        const current = byId.get(action.id);
        if (!current)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Saved action is unavailable",
          });
        return current;
      }),
    }));
    return StoredAssistantConversationSchema.parse({
      ...wireValue(row),
      turns,
      turnCount: turns.length,
    });
  }

  async get(id: string) {
    return this.snapshot(await this.owned(id));
  }

  async begin(input: BeginAssistantTurn) {
    const row = await this.owned(input.conversationId, true);
    if (row.mode !== input.mode)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Conversation mode is unavailable",
      });
    const conversation = await this.snapshot(row);
    const existing = conversation.turns.find(
      (turn) => turn.id === input.requestId,
    );
    if (existing) {
      if (
        input.mode === "text" &&
        (existing.voice || existing.question === "Consulta por voz")
      )
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Voice turn is unavailable in text mode",
        });
      if (existing.question !== input.text)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Request identifier already used",
        });
      return { acquired: false, conversation, turn: existing };
    }
    if (
      conversation.turnCount >= ASSISTANT_MAX_TURNS ||
      row.storedBytes > 500_000
    )
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Start a new conversation to continue",
      });
    const active = await this.db
      .selectFrom("assistant.conversation")
      .select("id")
      .where("leaseExpiresAt", ">", sql<Date>`clock_timestamp()`)
      .executeTakeFirst();
    if (active)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Another answer is still running",
      });
    const turn: AssistantTurn = {
      id: input.requestId,
      question: input.text,
      text: "",
      status: "pending",
      sources: [],
      actions: [],
      createdAt: new Date().toISOString(),
    };
    const turns = [...conversation.turns, turn];
    const saved = await this.db
      .updateTable("assistant.conversation")
      .set({
        turns: JSON.stringify(turns),
        title: conversation.turnCount
          ? row.title
          : input.text.replace(/\s+/g, " ").slice(0, 80),
        lease: input.lease,
        leaseExpiresAt: sql<Date>`clock_timestamp() + interval '90 seconds'`,
        updatedAt: sql<Date>`clock_timestamp()`,
      })
      .where("id", "=", row.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { acquired: true, conversation: await this.snapshot(saved), turn };
  }

  async finish({ conversationId, lease, turn }: FinishAssistantTurn) {
    const row = await this.owned(conversationId, true);
    const previous = row.turns.at(-1);
    if (
      row.lease !== lease ||
      !row.leaseExpiresAt ||
      row.leaseExpiresAt.getTime() <= Date.now() ||
      previous?.id !== turn.id ||
      previous.question !== turn.question ||
      previous.createdAt !== turn.createdAt ||
      previous.status !== "pending"
    )
      return { saved: false };
    await this.db
      .updateTable("assistant.conversation")
      .set({
        turns: JSON.stringify([...row.turns.slice(0, -1), turn]),
        lease: null,
        leaseExpiresAt: null,
        updatedAt: sql<Date>`clock_timestamp()`,
      })
      .where("id", "=", conversationId)
      .execute();
    return { saved: true };
  }

  async remove(id: string) {
    const row = await this.db
      .deleteFrom("assistant.conversation")
      .where("id", "=", id)
      .returning("id")
      .executeTakeFirst();
    return { removed: !!row };
  }

  async recordVoiceQuestion({
    conversationId,
    turnId,
    question,
  }: RecordAssistantVoiceQuestion) {
    const row = await this.owned(conversationId, true);
    const turn = row.turns.find((turn) => turn.id === turnId);
    if (
      !turn?.voice ||
      turn.question !== "Consulta por voz" ||
      !["interrupted", "failed"].includes(turn.status)
    )
      return { saved: false };
    if (!turn.voice.transcriptionPending)
      return { saved: turn.voice.question === question };
    // Fill only the missing readable input. Never change answer status, actions,
    // receipts, the current lease, or a question already recorded by the server.
    await this.db
      .updateTable("assistant.conversation")
      .set({
        turns: JSON.stringify(
          row.turns.map((value) =>
            value.id === turnId
              ? {
                  ...value,
                  voice: { question },
                }
              : value,
          ),
        ),
      })
      .where("id", "=", conversationId)
      .execute();
    return { saved: true };
  }
}
