import { randomUUID } from "node:crypto";
import type { AuthPrincipal } from "@lazyfinance/contracts";
import { Injectable } from "@nestjs/common";
import type { ContextOptions, TRPCContext } from "nestjs-trpc";
import { AuthService } from "../auth/auth.service";
import type { ApiRequestContext } from "./context";

@Injectable()
export class ApiContext implements TRPCContext {
  constructor(private readonly auth: AuthService) {}

  create({ req }: ContextOptions): ApiRequestContext {
    let principal: Promise<AuthPrincipal> | undefined;
    const authorization = req.headers.authorization;

    return {
      requestId: randomUUID(),
      authenticate: () => {
        principal ??= this.auth.authenticate(authorization);
        return principal;
      },
    };
  }
}
