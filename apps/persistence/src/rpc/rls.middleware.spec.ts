import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { PersistenceContext } from "@lazyfinance/contracts/context";
import { TRPCError } from "@trpc/server";
import type { Kysely, Transaction } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { withRequestContext } from "../database/rls";
import { RlsMiddleware } from "./rls.middleware";

vi.mock("@lazyfinance/contracts/internal", () => ({
  MAX_PERSISTENCE_RPC_BYTES: 128,
}));

vi.mock("../database/rls", () => ({
  withRequestContext: vi.fn(
    async <DB, Result>(
      _db: Kysely<DB>,
      _ctx: PersistenceContext,
      operation: (transaction: Transaction<DB>) => Promise<Result>,
    ): Promise<Result> => operation({} as Transaction<DB>),
  ),
}));

describe("private middleware denial and result budgets (scaled byte limit)", () => {
  const middleware = new RlsMiddleware({} as Kysely<Record<string, never>>);
  const options = (data: unknown) => ({
    ctx: {
      identity: {
        kind: "user" as const,
        userId: randomUUID(),
        requestId: randomUUID(),
      },
    },
    type: "query" as const,
    path: "accounts.listActive",
    meta: { context: "user" as const },
    input: undefined,
    getRawInput: async () => undefined,
    signal: undefined,
    next: vi.fn(async () => ({ ok: true as const, data })),
  });
  it("denies missing metadata and bootstrap context confusion before opening SQL", async () => {
    const calls = vi.mocked(withRequestContext).mock.calls.length;
    await expect(
      middleware.use({ ...options(null), meta: undefined! }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const invalid = {
      ...options(null),
      meta: { context: "identity-bootstrap" as const },
    };
    await expect(middleware.use(invalid)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(vi.mocked(withRequestContext).mock.calls).toHaveLength(calls);
  });
  it("checks serialized bytes, including JSON quotes and multi-byte text, inside the transaction", async () => {
    await expect(
      middleware.use(options("a".repeat(126))),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      middleware.use(options("a".repeat(127))),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    await expect(
      middleware.use(options("界".repeat(43))),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("admits OAuth state only on its explicit procedure allowlist, never finance or identity bootstrap", async () => {
    const scoped = {
      ...options(null),
      ctx: {
        identity: {
          kind: "mcp-authorization" as const,
          requestId: randomUUID(),
        },
      },
      meta: { context: "mcp-authorization" as const },
    };
    for (const path of [
      "accounts.listActive",
      "identity.resolve",
      "mcpArtifacts.arbitrary",
      "mcpGrants.bind",
    ])
      await expect(middleware.use({ ...scoped, path })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    for (const path of [
      "mcpArtifacts.find",
      "mcpArtifacts.save",
      "mcpArtifacts.consume",
      "mcpArtifacts.destroy",
      "mcpArtifacts.identity",
      "mcpArtifacts.revoke",
    ])
      await expect(middleware.use({ ...scoped, path })).resolves.toMatchObject({
        ok: true,
      });
    await expect(
      middleware.use({
        ...options(null),
        path: "mcpArtifacts.find",
        meta: scoped.meta,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("preserves wrapped input/application codes from a different tRPC instance", async () => {
    const foreign = Object.assign(new Error("Duplicate budget windows"), {
      code: "BAD_REQUEST" as const,
    });
    expect(foreign).not.toBeInstanceOf(TRPCError);
    await expect(
      middleware.use({
        ...options(null),
        next: vi.fn(async () => ({ ok: false as const, error: foreign })),
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Duplicate budget windows",
    });
  });

  it("prioritizes sanitized SQLSTATE mappings over an outer application code", async () => {
    const foreign = Object.assign(new Error("private SQL details"), {
      code: "BAD_REQUEST" as const,
      cause: Object.assign(new Error("private constraint details"), {
        code: "23503",
      }),
    });
    await expect(
      middleware.use({
        ...options(null),
        next: vi.fn(async () => ({ ok: false as const, error: foreign })),
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Invalid persistence data",
    });
  });

  it("does not expose an outer message when the nested SQLSTATE is unknown", async () => {
    const foreign = Object.assign(new Error("private table and SQL text"), {
      code: "BAD_REQUEST" as const,
      cause: Object.assign(new Error("private SQL details"), { code: "42P01" }),
    });
    await expect(
      middleware.use({
        ...options(null),
        next: vi.fn(async () => ({ ok: false as const, error: foreign })),
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Persistence operation failed",
    });
  });
});
