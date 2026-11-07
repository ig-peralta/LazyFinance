import { HttpException } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { persistenceException } from "./persistence-error";

export function rpcError(error: unknown): TRPCError {
  let cause: unknown = error;
  let known: { code: TRPCError["code"]; message: string } | undefined;

  for (
    let depth = 0;
    depth < 8 && cause && typeof cause === "object";
    depth++
  ) {
    // Nest's adapter and generated packages may resolve different tRPC module
    // instances. Do not rely solely on instanceof for an upstream tRPC error.
    if (
      "code" in cause &&
      typeof cause.code === "string" &&
      [
        "BAD_REQUEST",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "NOT_FOUND",
        "CONFLICT",
        "PAYLOAD_TOO_LARGE",
        "TOO_MANY_REQUESTS",
        "METHOD_NOT_SUPPORTED",
      ].includes(cause.code)
    ) {
      known ??= {
        code: cause.code as TRPCError["code"],
        message:
          "message" in cause && typeof cause.message === "string"
            ? cause.message
            : "Operation failed",
      };
    }

    const exception =
      cause instanceof HttpException ? cause : persistenceException(cause);
    if (exception) {
      const status = exception.getStatus();
      const codes: Partial<Record<number, TRPCError["code"]>> = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        413: "PAYLOAD_TOO_LARGE",
        429: "TOO_MANY_REQUESTS",
        503: "SERVICE_UNAVAILABLE",
      };
      return new TRPCError({
        code: codes[status] ?? "INTERNAL_SERVER_ERROR",
        message:
          status < 500 || status === 503
            ? exception.message
            : "Operation failed",
      });
    }

    cause = "cause" in cause ? cause.cause : undefined;
  }

  if (known) return new TRPCError(known);
  if (error instanceof TRPCError && error.code !== "INTERNAL_SERVER_ERROR")
    return error;

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Operation failed",
  });
}
