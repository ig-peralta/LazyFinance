import type { AuthPrincipal } from "@lazyfinance/contracts";
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { McpAuthorizationService } from "./mcp-authorization.service";
import { MCP_READ_SCOPE } from "./oauth-policy";

export type McpAuthenticatedRequest = Request & {
  principal: Pick<AuthPrincipal, "userId">;
  user: Pick<AuthPrincipal, "userId">;
  mcp: { grantId: string; clientId: string; scopes: string[] };
};

@Injectable()
export class McpAccessGuard implements CanActivate {
  constructor(private readonly authorization: McpAuthorizationService) {}

  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp(),
      req = http.getRequest<McpAuthenticatedRequest>(),
      res = http.getResponse<Response>();
    const result = await this.authorization.authenticate(
      req.headers.authorization,
    );
    const settings = this.authorization.settings;
    const challenge = `Bearer${settings ? ` resource_metadata="${settings.issuer}/.well-known/oauth-protected-resource/mcp", scope="${MCP_READ_SCOPE}"` : ""}`;
    res.set("Cache-Control", "private, no-store");
    if (result.status !== "authorized") {
      res.set(
        "WWW-Authenticate",
        `${challenge}${result.status === "insufficient" ? ', error="insufficient_scope"' : req.headers.authorization ? ', error="invalid_token"' : ""}`,
      );
      if (result.status === "insufficient")
        throw new ForbiddenException("Read-only MCP permission required");
      throw new UnauthorizedException("External MCP authorization required");
    }
    if (
      !(await this.authorization.originAllowed(
        req.headers.origin,
        result.clientId,
      ))
    )
      throw new ForbiddenException("Untrusted MCP request origin");
    req.principal = { userId: result.userId };
    req.user = req.principal;
    req.mcp = {
      grantId: result.grantId,
      clientId: result.clientId,
      scopes: result.scopes,
    };
    return true;
  }
}
