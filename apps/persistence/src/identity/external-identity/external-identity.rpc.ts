import { AuthPrincipalSchema } from "@lazyfinance/contracts";
import { IdentityResolutionInputSchema } from "@lazyfinance/contracts/internal";
import { Inject } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { Ctx, Input, Mutation, Router } from "nestjs-trpc";
import type { PersistenceRequestContext } from "../../rpc/persistence.context";
import { ExternalIdentityRepository } from "./external-identity.repository";

@Router({ alias: "identity" })
export class ExternalIdentityRpc {
  constructor(
    @Inject(ExternalIdentityRepository)
    private readonly repository: ExternalIdentityRepository,
  ) {}
  @Mutation({
    input: IdentityResolutionInputSchema,
    output: AuthPrincipalSchema,
    meta: { context: "identity-bootstrap" },
  })
  resolve(
    @Input() input: { mode: "existing" | "provision" },
    @Ctx() ctx: PersistenceRequestContext,
  ) {
    if (ctx.identity.kind !== "identity-bootstrap")
      throw new TRPCError({ code: "FORBIDDEN" });
    return this.repository.resolve(
      ctx.identity.identity,
      input.mode === "provision",
    );
  }
}
