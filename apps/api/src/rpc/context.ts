import type { AuthPrincipal } from "@lazyfinance/contracts";
import { TRPCError } from "@trpc/server";

export type ApiRequestContext = {
  requestId: string;
  principal?: AuthPrincipal;
  authenticate: () => Promise<AuthPrincipal>;
};

export function rpcUser(ctx: ApiRequestContext): string {
  if (!ctx.principal) throw new TRPCError({ code: "UNAUTHORIZED" });

  return ctx.principal.userId;
}
