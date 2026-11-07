import { HttpException, ServiceUnavailableException } from "@nestjs/common";
import { TRPCClientError } from "@trpc/client";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { persistenceException } from "./persistence-error";
import { rpcError } from "./rpc-error";

function upstream(httpStatus: number, message: string) {
  return new TRPCClientError(message, {
    result: {
      error: {
        message,
        code: -32603,
        data: { httpStatus },
      },
    },
  });
}

describe("RPC error policy", () => {
  it.each([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [413, "PAYLOAD_TOO_LARGE"],
    [429, "TOO_MANY_REQUESTS"],
  ] as const)("preserves known persistence failures with HTTP status %s", (status, code) => {
    const error = upstream(status, "Owned operation rejected");
    expect(persistenceException(error)?.getStatus()).toBe(status);
    expect(rpcError({ cause: error })).toMatchObject({
      code,
      message: error.message,
    });
  });

  it("hides upstream server details behind a generic unavailable error", () => {
    const error = upstream(500, "select private_key from hidden_table");
    expect(persistenceException(error)).toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(rpcError(error)).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "Persistence is unavailable",
    });
    expect(persistenceException(new Error("unrelated"))).toBeUndefined();
  });

  it("sanitizes internal exceptions while retaining deliberate unavailable messages", () => {
    expect(
      rpcError(new HttpException("private database details", 500)),
    ).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Operation failed",
    });
    expect(
      rpcError(
        new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "private key",
        }),
      ),
    ).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Operation failed",
    });
    expect(
      rpcError(new ServiceUnavailableException("Try again later")),
    ).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "Try again later",
    });
  });

  it("recognizes safe codes from wrapped errors without sharing a tRPC class instance", () => {
    expect(
      rpcError({ cause: { code: "NOT_FOUND", message: "Record not found" } }),
    ).toMatchObject({ code: "NOT_FOUND", message: "Record not found" });
  });

  it("bounds traversal even when error causes are cyclic", () => {
    const error: { cause?: unknown } = {};
    error.cause = error;
    expect(rpcError(error)).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Operation failed",
    });
  });
});
