import { McpGrantSchema, McpGrantsSchema } from "@lazyfinance/contracts";
import type {
  BindMcpGrant,
  FindMcpArtifact,
  McpArtifactKey,
  SaveMcpArtifact,
} from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import { RLS_DB } from "../../database/tokens";
import { wireValue } from "../../serialization";
import type { McpAuthorizationTables } from "./mcp-authorization.tables";

const grantFields = [
  "id",
  "clientId",
  "clientName",
  "resource",
  "scopes",
  "createdAt",
  "expiresAt",
  "revokedAt",
] as const;

@Injectable()
export class McpAuthorizationRepository {
  constructor(
    @Inject(RLS_DB) private readonly db: Kysely<McpAuthorizationTables>,
  ) {}

  async find({ model, key, byUid }: FindMcpArtifact) {
    const row = await this.db
      .selectFrom("identity.mcp_artifact")
      .select(["key", "ciphertext", "consumedAt"])
      .where("model", "=", model)
      .where(byUid ? "uidHash" : "key", "=", key)
      .where((eb) =>
        eb.or([
          eb("expiresAt", ">", sql<Date>`clock_timestamp()`),
          eb("expiresAt", "is", null),
        ]),
      )
      .executeTakeFirst();
    return row ? wireValue(row) : null;
  }

  async save(input: SaveMcpArtifact) {
    const { expiresIn, ...fields } = input;
    if (input.grantId) {
      await this.lockGrant(input.grantId);
      const grant = await this.db
        .selectFrom("identity.mcp_grant")
        .select(
          sql<boolean>`revoked_at is null and expires_at > clock_timestamp()`.as(
            "active",
          ),
        )
        .where("id", "=", input.grantId)
        .executeTakeFirst();
      if (grant && !grant.active) return { saved: false };
    }
    // Bounded incremental expiry cleanup; never touch financial tables.
    await sql`select pg_advisory_xact_lock(hashtextextended('lazyfinance:mcp-artifact-quota', 0))`.execute(
      this.db,
    );
    await sql`delete from identity.mcp_artifact where (model, key) in
      (select model, key from identity.mcp_artifact where expires_at <= clock_timestamp() limit 50)
      and expires_at <= clock_timestamp()`.execute(this.db);
    const count = await this.db
      .selectFrom("identity.mcp_artifact")
      .select(sql<number>`count(*)::int`.as("count"))
      .executeTakeFirstOrThrow();
    const existing =
      count.count >= 100_000
        ? await this.db
            .selectFrom("identity.mcp_artifact")
            .select("key")
            .where("model", "=", input.model)
            .where("key", "=", input.key)
            .executeTakeFirst()
        : undefined;
    if (count.count >= 100_000 && !existing)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Authorization storage limit exceeded",
      });
    const inserted = this.db.insertInto("identity.mcp_artifact").values({
      ...fields,
      expiresAt:
        expiresIn === null
          ? null
          : sql<Date>`clock_timestamp() + ${expiresIn} * interval '1 second'`,
    });
    const result =
      input.model === "ReplayDetection"
        ? await inserted
            .onConflict((oc) =>
              oc
                .columns(["model", "key"])
                .doUpdateSet({
                  ...fields,
                  expiresAt: sql<Date>`excluded.expires_at`,
                  consumedAt: null,
                })
                .where(
                  "identity.mcp_artifact.expiresAt",
                  "<=",
                  sql<Date>`clock_timestamp()`,
                ),
            )
            .returning("key")
            .executeTakeFirst()
        : await inserted
            .onConflict((oc) =>
              oc.columns(["model", "key"]).doUpdateSet({
                ...fields,
                expiresAt: sql<Date>`excluded.expires_at`,
                // Upsert must never resurrect a concurrently consumed code/token.
              }),
            )
            .returning("key")
            .executeTakeFirst();
    return { saved: !!result };
  }

  async consume({ model, key }: McpArtifactKey) {
    const artifact = await this.db
      .selectFrom("identity.mcp_artifact")
      .select("grantId")
      .where("model", "=", model)
      .where("key", "=", key)
      .executeTakeFirst();
    if (artifact?.grantId) await this.lockGrant(artifact.grantId);
    const row = await this.db
      .updateTable("identity.mcp_artifact")
      .set({ consumedAt: sql<Date>`clock_timestamp()` })
      .where("model", "=", model)
      .where("key", "=", key)
      .where("consumedAt", "is", null)
      .where("expiresAt", ">", sql<Date>`clock_timestamp()`)
      .returning("key")
      .executeTakeFirst();
    if (!row && (model === "RefreshToken" || model === "AuthorizationCode")) {
      const prior = await this.db
        .selectFrom("identity.mcp_artifact")
        .select(["consumedAt", "grantId"])
        .where("model", "=", model)
        .where("key", "=", key)
        .forUpdate()
        .executeTakeFirst();
      // Return a rejected result rather than throwing in this transaction: the
      // family revocation must commit before the provider reports invalid_grant.
      if (prior?.consumedAt && prior.grantId) await this.revoke(prior.grantId);
    }
    return { consumed: !!row };
  }

  async destroy({ model, key }: McpArtifactKey) {
    const artifact = await this.db
      .selectFrom("identity.mcp_artifact")
      .select("grantId")
      .where("model", "=", model)
      .where("key", "=", key)
      .executeTakeFirst();
    if (artifact?.grantId) await this.lockGrant(artifact.grantId);
    const row = await this.db
      .deleteFrom("identity.mcp_artifact")
      .where("model", "=", model)
      .where("key", "=", key)
      .returning("grantId")
      .executeTakeFirst();
    if (model === "Grant" && row?.grantId) await this.revoke(row.grantId);
    return { ok: true as const };
  }

  async bind(input: BindMcpGrant) {
    await this.lockGrant(input.id);
    const artifact = await this.db
      .selectFrom("identity.mcp_artifact")
      .select("key")
      .where("model", "=", "Grant")
      .where("key", "=", input.key)
      .where("grantId", "=", input.id)
      .where("accountId", "=", sql<string>`identity.current_user_id()`)
      .where("clientId", "=", input.clientId)
      .where("expiresAt", ">", sql<Date>`clock_timestamp()`)
      .executeTakeFirst();
    if (!artifact)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Grant does not belong to this account",
      });
    const active = await this.db
      .selectFrom("identity.mcp_grant")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("revokedAt", "is", null)
      .where("expiresAt", ">", sql<Date>`clock_timestamp()`)
      .executeTakeFirstOrThrow();
    if (active.count >= 50)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Revoke an existing client grant before adding another",
      });
    const { key: _key, ...fields } = input;
    const row = await this.db
      .insertInto("identity.mcp_grant")
      .values({ ...fields, userId: sql<string>`identity.current_user_id()` })
      .returning(grantFields)
      .executeTakeFirstOrThrow();
    return McpGrantSchema.parse(wireValue(row));
  }

  async list() {
    const rows = await this.db
      .selectFrom("identity.mcp_grant")
      .select(grantFields)
      .orderBy(sql<boolean>`revoked_at is not null`, "asc")
      .orderBy("expiresAt", "desc")
      .limit(100)
      .execute();
    return McpGrantsSchema.parse(wireValue(rows));
  }

  async identity(id: string) {
    const row = await this.db
      .selectFrom("identity.mcp_grant")
      .select([...grantFields, "userId"])
      .where("id", "=", id)
      .where("revokedAt", "is", null)
      .where("expiresAt", ">", sql<Date>`clock_timestamp()`)
      .executeTakeFirst();
    return row ? wireValue(row) : null;
  }

  async revoke(id: string) {
    await this.lockGrant(id);
    const row = await this.db
      .updateTable("identity.mcp_grant")
      .set({ revokedAt: sql<Date>`coalesce(revoked_at, clock_timestamp())` })
      .where("id", "=", id)
      .returning("id")
      .executeTakeFirst();
    // Also remove unbound/incomplete provider artifacts for an explicit provider revoke.
    await this.db
      .deleteFrom("identity.mcp_artifact")
      .where("grantId", "=", id)
      .execute();
    return { revoked: !!row };
  }

  private async lockGrant(id: string) {
    await sql`select pg_advisory_xact_lock(hashtextextended(${`lazyfinance:mcp-grant:${id}`}, 0))`.execute(
      this.db,
    );
  }
}
