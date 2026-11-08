import { MAX_PERSISTENCE_RPC_BYTES } from "@lazyfinance/contracts/internal";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { type Kysely, sql } from "kysely";
import type { MiddlewareOptions, TRPCMiddleware } from "nestjs-trpc";
import { withRequestContext } from "../database/rls";
import { RUNTIME_DB } from "../database/tokens";
import type { PersistenceRequestContext } from "./persistence.context";

type ProcedureMeta = {
  context: "user" | "identity-bootstrap";
  snapshot?: boolean;
};

@Injectable()
export class RlsMiddleware implements TRPCMiddleware<ProcedureMeta> {
  constructor(
    @Inject(RUNTIME_DB)
    private readonly database: Kysely<Record<string, never>>,
  ) {}

  async use(
    options: MiddlewareOptions<
      PersistenceRequestContext,
      Record<string, unknown>,
      ProcedureMeta
    >,
  ) {
    if (
      !options.meta ||
      !["user", "identity-bootstrap"].includes(options.meta.context) ||
      options.ctx.identity.kind !== options.meta.context ||
      (options.meta.context === "identity-bootstrap" &&
        options.path !== "identity.resolve")
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Procedure context is not permitted",
      });
    }

    try {
      return await withRequestContext(
        this.database,
        options.ctx.identity,
        async (tx) => {
          // All writes for a user share a short lock, including prepared batch
          // commits. Remote provider calls/calculations never happen in this scope.
          if (
            options.type === "mutation" &&
            options.ctx.identity.kind === "user"
          ) {
            await sql`select pg_advisory_xact_lock(hashtextextended(${`lazyfinance:user:${options.ctx.identity.userId}`}, 0))`.execute(
              tx,
            );
          }

          const result = await options.next();
          // tRPC resolves failures instead of throwing: do not accidentally COMMIT.
          if (!result.ok) throw result.error;
          if (
            Buffer.byteLength(JSON.stringify(result.data) ?? "null") >
            MAX_PERSISTENCE_RPC_BYTES
          ) {
            throw new TRPCError({
              code: "PAYLOAD_TOO_LARGE",
              message: "Persistence result exceeds transport budget",
            });
          }

          return result;
        },
        options.meta.snapshot ? "repeatable read" : "read committed",
      );
    } catch (error) {
      // Kysely and tRPC may wrap pg errors. SQLSTATE mappings take precedence
      // over application messages; unknown database failures stay sanitized.
      let cause: unknown = error;
      let code: unknown;
      let known: { code: TRPCError["code"]; message: string } | undefined;

      for (
        let depth = 0;
        depth < 8 && cause && typeof cause === "object";
        depth++
      ) {
        if ("code" in cause && typeof cause.code === "string") {
          if (/^[0-9A-Z]{5}$/.test(cause.code)) {
            code = cause.code;
            break;
          }

          // Nest's adapter can wrap errors from another tRPC module instance.
          // Recognize explicit application codes without exposing raw SQL errors.
          const value = cause.code;
          const applicationCode = (
            [
              "BAD_REQUEST",
              "UNAUTHORIZED",
              "FORBIDDEN",
              "NOT_FOUND",
              "CONFLICT",
              "PAYLOAD_TOO_LARGE",
              "TOO_MANY_REQUESTS",
              "METHOD_NOT_SUPPORTED",
              "TIMEOUT",
            ] as const
          ).find((candidate) => candidate === value);
          if (applicationCode)
            known ??= {
              code: applicationCode,
              message:
                "message" in cause && typeof cause.message === "string"
                  ? cause.message
                  : "Persistence operation failed",
            };
        }

        cause = "cause" in cause ? cause.cause : undefined;
      }

      if (code === "23505" || code === "40001" || code === "40P01")
        throw new TRPCError({
          code: "CONFLICT",
          message: "Conflicting or stale data",
        });
      if (code === "28000")
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Identity is not linked",
        });
      if (code === "42501")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Operation is not permitted",
        });
      if (
        code === "23514" ||
        code === "22023" ||
        code === "22003" ||
        code === "23503"
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid persistence data",
        });
      if (code === "55P03" || code === "57014")
        throw new TRPCError({
          code: "TIMEOUT",
          message: "Persistence operation timed out",
        });
      if (code === undefined && known) throw new TRPCError(known);
      if (
        code === undefined &&
        error instanceof TRPCError &&
        error.code !== "INTERNAL_SERVER_ERROR"
      )
        throw error;

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Persistence operation failed",
      });
    }
  }
}
