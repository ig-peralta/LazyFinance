import {
  FinancialWriteScopeSchema,
  McpConsentDecisionSchema,
  McpConsentResultSchema,
} from "@lazyfinance/contracts";
import {
  All,
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../auth/auth.types";
import { Public } from "../../auth/public.decorator";
import { McpAuthorizationService } from "./mcp-authorization.service";
import { MCP_READ_SCOPE } from "./oauth-policy";

@Controller("oauth/interaction")
export class McpInteractionHttp {
  constructor(private readonly authorization: McpAuthorizationService) {}

  @Public()
  @Get(":id")
  enter(@Param("id") id: string, @Res() res: Response) {
    const settings = this.authorization.settings;
    if (!settings || !/^[A-Za-z0-9_-]{1,256}$/.test(id))
      throw new NotFoundException();
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    res.redirect(
      302,
      `${settings.uiOrigin}/autorizar-mcp?interaction=${encodeURIComponent(id)}`,
    );
  }

  @Get(":id/details")
  async details(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    res.set({
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    });
    res.json(await this.authorization.preview(id, req, res));
  }

  @Post(":id/decision")
  async decide(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    if (req.headers.origin !== this.authorization.settings?.uiOrigin)
      throw new BadRequestException("Untrusted interaction origin");
    const decision = McpConsentDecisionSchema.safeParse(body);
    if (!decision.success)
      throw new BadRequestException("Invalid consent decision");
    res.set({
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    });
    res.json(
      McpConsentResultSchema.parse(
        await this.authorization.decide(
          id,
          req.principal.userId,
          decision.data.approve,
          req,
          res,
          decision.data.scopes ?? [],
        ),
      ),
    );
  }
}

@Public()
@Controller()
export class McpOAuthHttp {
  constructor(private readonly authorization: McpAuthorizationService) {}

  @Get([
    ".well-known/oauth-protected-resource",
    ".well-known/oauth-protected-resource/mcp",
  ])
  resource(@Res() res: Response) {
    const settings = this.authorization.settings;
    if (!settings) throw new NotFoundException();
    res.set("Cache-Control", "no-store").json({
      resource: settings.resource,
      authorization_servers: [settings.issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: [MCP_READ_SCOPE, ...FinancialWriteScopeSchema.options],
      resource_name: "LazyFinance · Consultas financieras",
    });
  }

  @Get([
    ".well-known/oauth-authorization-server",
    ".well-known/openid-configuration",
  ])
  metadata(@Req() req: Request, @Res() res: Response) {
    req.url = "/.well-known/openid-configuration";
    return this.authorization.server().callback()(req, res);
  }

  @All("oauth/{*path}")
  protocol(@Req() req: Request, @Res() res: Response) {
    return this.authorization.server().callback()(req, res);
  }
}
