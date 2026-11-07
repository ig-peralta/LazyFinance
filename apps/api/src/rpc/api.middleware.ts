import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type { MiddlewareOptions, TRPCMiddleware } from "nestjs-trpc";
import type { ApiRequestContext } from "./context";
import { withApiRequest } from "./request-context";
import { rpcError } from "./rpc-error";

@Injectable()
export class ApiMiddleware
  implements TRPCMiddleware<{ auth: "public" | "user" }>
{
  async use(
    options: MiddlewareOptions<
      ApiRequestContext,
      Record<string, unknown>,
      { auth: "public" | "user" }
    >,
  ) {
    return withApiRequest(options.ctx.requestId, async () => {
      try {
        const auth = options.meta?.auth;

        if (auth === "public") {
          if (!["auth.config", "auth.loginMock"].includes(options.path))
            throw new TRPCError({ code: "FORBIDDEN" });
        } else if (auth === "user")
          options.ctx.principal = await options.ctx.authenticate();
        else throw new TRPCError({ code: "FORBIDDEN" });

        const result = await options.next();
        if (!result.ok) throw result.error;

        return result;
      } catch (error) {
        throw rpcError(error);
      }
    });
  }
}
