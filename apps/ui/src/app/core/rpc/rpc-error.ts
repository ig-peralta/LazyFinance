import type { ApiRouter } from "@lazyfinance/rpc-api";
import { TRPCClientError } from "@trpc/client";

export function isUnauthorized(error: unknown): boolean {
  return (
    error instanceof TRPCClientError &&
    (error as TRPCClientError<ApiRouter>).data?.code === "UNAUTHORIZED"
  );
}

export function isCancelled(error: unknown): boolean {
  let cause = error;

  for (
    let depth = 0;
    depth < 8 && cause && typeof cause === "object";
    depth++
  ) {
    if ("name" in cause && cause.name === "AbortError") return true;

    cause = "cause" in cause ? cause.cause : undefined;
  }

  return false;
}
