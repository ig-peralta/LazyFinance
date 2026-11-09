import { randomUUID } from "node:crypto";
import {
  type FinancialActionRequest,
  FinancialActionSchema,
  financialActionScopes,
} from "@lazyfinance/contracts";
import type {
  ExecuteFinancialAction,
  FinancialActionCommand,
  PrepareFinancialAction,
} from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, type Selectable, sql } from "kysely";
import type { AssistantTables } from "../assistant/assistant.tables";
import { fingerprint } from "../database/fingerprint";
import { RLS_DB } from "../database/tokens";
import type { McpAuthorizationTables } from "../identity/mcp-authorization/mcp-authorization.tables";
import { wireValue } from "../serialization";
import type { ActionTables } from "./action.tables";
import { assertActionSelection } from "./action-command";
import { ActionExecutor } from "./action-executor";
import { ActionFactsRepository } from "./action-facts.repository";

type ActionRow = Selectable<ActionTables["assistant.action"]>;

@Injectable()
export class ActionRepository {
  constructor(
    @Inject(RLS_DB)
    private readonly db: Kysely<
      ActionTables & AssistantTables & McpAuthorizationTables
    >,
    private readonly facts: ActionFactsRepository,
    private readonly executor: ActionExecutor,
  ) {}

  snapshot(row: ActionRow) {
    const status =
      row.status === "proposed" || row.status === "stale"
        ? !row.conversationId
          ? "cancelled"
          : row.expiresAt.getTime() <= Date.now()
            ? "expired"
            : row.status
        : row.status;
    return FinancialActionSchema.parse({ ...wireValue(row), status });
  }

  async listForConversation(id: string) {
    const rows = await this.db
      .selectFrom("assistant.action")
      .selectAll()
      .where("conversationId", "=", id)
      .orderBy("createdAt")
      .limit(97)
      .execute();
    return rows.map((row) => this.snapshot(row));
  }

  private async owned(id: string) {
    const row = await this.db
      .selectFrom("assistant.action")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Action is unavailable",
      });
    return row;
  }

  async get(id: string) {
    return this.snapshot(await this.owned(id));
  }

  preview(action: FinancialActionRequest) {
    return this.facts.preview(action);
  }

  private async conversation(id: string) {
    const row = await this.db
      .selectFrom("assistant.conversation")
      .selectAll()
      .where("id", "=", id)
      .where("expiresAt", ">", sql<Date>`clock_timestamp()`)
      .executeTakeFirst();
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Conversation is unavailable",
      });
    return row;
  }

  private async ready(row: ActionRow, complete: boolean) {
    if (row.origin !== "assistant" || !row.conversationId || !row.turnId)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Not an assistant proposal",
      });
    const conversation = await this.conversation(row.conversationId);
    const turn = conversation.turns.find((turn) => turn.id === row.turnId);
    if (
      !turn ||
      (complete &&
        (turn.status !== "complete" ||
          !turn.actions.some((action) => action.id === row.id)))
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Only a completed saved turn can authorize its proposal",
      });
    return conversation;
  }

  private version(row: ActionRow, version: number) {
    if (row.version !== version)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Action version changed; reload the preview",
      });
  }

  private async quota() {
    const count = await this.db
      .selectFrom("assistant.action")
      .select(sql<number>`count(*)::int`.as("count"))
      .executeTakeFirstOrThrow();
    if (count.count >= 10000)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Action storage limit reached",
      });
  }

  async prepare(input: PrepareFinancialAction) {
    assertActionSelection(input.action, input.command);
    const conversation = await this.conversation(input.conversationId);
    if (
      conversation.turns.at(-1)?.id !== input.turnId ||
      conversation.turns.at(-1)?.status !== "pending" ||
      !conversation.leaseExpiresAt ||
      conversation.leaseExpiresAt.getTime() <= Date.now()
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "The generation is no longer active",
      });
    const previous = await this.db
      .selectFrom("assistant.action")
      .selectAll()
      .where("conversationId", "=", input.conversationId)
      .where("turnId", "=", input.turnId)
      .execute();
    const duplicate = previous.find(
      (row) =>
        fingerprint(row.request) === fingerprint(input.action) &&
        fingerprint(row.command) === fingerprint(input.command),
    );
    if (duplicate) return this.snapshot(duplicate);
    if (previous.length >= 4)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "At most four proposals per turn",
      });
    await this.quota();
    const preview = await this.facts.preview(input.action);
    const row = await this.db
      .insertInto("assistant.action")
      .values({
        userId: sql<string>`identity.current_user_id()`,
        conversationId: input.conversationId,
        turnId: input.turnId,
        origin: "assistant",
        requestId: randomUUID(),
        grantId: null,
        clientId: null,
        request: JSON.stringify(input.action),
        command: JSON.stringify(input.command),
        context: JSON.stringify(preview.context),
        fingerprint: preview.fingerprint,
        status: "proposed",
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.snapshot(row);
  }

  async revise(input: {
    id: string;
    version: number;
    action: FinancialActionRequest;
    command: FinancialActionCommand;
  }) {
    assertActionSelection(input.action, input.command);
    const row = await this.owned(input.id);
    this.version(row, input.version);
    await this.ready(row, true);
    if (
      !["proposed", "stale"].includes(row.status) ||
      input.action.kind !== row.request.kind ||
      input.command.kind !== row.command.kind ||
      Date.now() + 900000 > row.createdAt.getTime() + 31 * 86400000
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Prepare a new proposal instead",
      });
    const preview = await this.facts.preview(input.action);
    const saved = await this.db
      .updateTable("assistant.action")
      .set({
        version: row.version + 1,
        request: JSON.stringify(input.action),
        command: JSON.stringify(input.command),
        context: JSON.stringify(preview.context),
        fingerprint: preview.fingerprint,
        status: "proposed",
        expiresAt: sql<Date>`clock_timestamp()+interval '15 minutes'`,
      })
      .where("id", "=", row.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.snapshot(saved);
  }

  async cancel(input: { id: string; version: number }) {
    const row = await this.owned(input.id);
    this.version(row, input.version);
    if (row.status === "applied" || row.status === "cancelled")
      return this.snapshot(row);
    await this.ready(row, false);
    return this.snapshot(
      await this.db
        .updateTable("assistant.action")
        .set({ status: "cancelled" })
        .where("id", "=", row.id)
        .returningAll()
        .executeTakeFirstOrThrow(),
    );
  }

  async apply(input: {
    id: string;
    version: number;
    command: FinancialActionCommand | null;
  }) {
    const row = await this.owned(input.id);
    this.version(row, input.version);
    // A receipt remains readable/replay-safe after chat deletion or expiry.
    if (row.status === "applied") return this.snapshot(row);
    await this.ready(row, true);
    if (this.snapshot(row).status !== "proposed") return this.snapshot(row);
    let current:
      | Awaited<ReturnType<ActionFactsRepository["preview"]>>
      | undefined;
    try {
      current = await this.facts.preview(row.request);
    } catch (error) {
      if (
        !(error instanceof TRPCError) ||
        !["BAD_REQUEST", "NOT_FOUND", "CONFLICT"].includes(error.code)
      )
        throw error;
    }
    if (
      !current ||
      current.fingerprint !== row.fingerprint ||
      !input.command ||
      fingerprint(input.command) !== fingerprint(row.command)
    ) {
      return this.snapshot(
        await this.db
          .updateTable("assistant.action")
          .set({ status: "stale" })
          .where("id", "=", row.id)
          .returningAll()
          .executeTakeFirstOrThrow(),
      );
    }
    const results = await this.executor.execute(row.command, current.context);
    return this.snapshot(
      await this.db
        .updateTable("assistant.action")
        .set({ status: "applied", results: JSON.stringify(results) })
        .where("id", "=", row.id)
        .returningAll()
        .executeTakeFirstOrThrow(),
    );
  }

  async executeDirect(input: ExecuteFinancialAction) {
    if (input.command) assertActionSelection(input.input.action, input.command);
    const grant = await this.db
      .selectFrom("identity.mcp_grant")
      .selectAll()
      .where("id", "=", input.grantId)
      .where("clientId", "=", input.clientId)
      .where("revokedAt", "is", null)
      .where("expiresAt", ">", sql<Date>`clock_timestamp()`)
      .forShare()
      .executeTakeFirst();
    if (
      !grant ||
      !financialActionScopes(input.input.action).every((scope) =>
        grant.scopes.includes(scope),
      )
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Explicit MCP write permissions required",
      });
    const existing = await this.db
      .selectFrom("assistant.action")
      .selectAll()
      .where("origin", "=", "mcp")
      .where("requestId", "=", input.input.requestId)
      .executeTakeFirst();
    if (existing) {
      if (
        existing.grantId !== input.grantId ||
        existing.clientId !== input.clientId ||
        fingerprint(existing.request) !== fingerprint(input.input.action) ||
        (input.input.expectedFingerprint &&
          input.input.expectedFingerprint !== existing.fingerprint)
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "Request identifier already used",
        });
      return this.snapshot(existing);
    }
    if (!input.command)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Action no longer satisfies the current schedule policy",
      });
    await this.quota();
    const preview = await this.facts.preview(input.input.action);
    if (
      input.input.expectedFingerprint &&
      preview.fingerprint !== input.input.expectedFingerprint
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Selection changed; preview again",
      });
    const results = await this.executor.execute(input.command, preview.context);
    const row = await this.db
      .insertInto("assistant.action")
      .values({
        userId: sql<string>`identity.current_user_id()`,
        origin: "mcp",
        conversationId: null,
        turnId: null,
        requestId: input.input.requestId,
        grantId: input.grantId,
        clientId: input.clientId,
        request: JSON.stringify(input.input.action),
        command: JSON.stringify(input.command),
        context: JSON.stringify(preview.context),
        fingerprint: preview.fingerprint,
        status: "applied",
        results: JSON.stringify(results),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.snapshot(row);
  }
}
