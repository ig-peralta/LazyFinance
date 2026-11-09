import {
  FinancialWriteScopeSchema,
  McpConsentSchema,
} from "@lazyfinance/contracts";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { Provider } from "oidc-provider";
import { z } from "zod";
import { EnvironmentService } from "../../environment/environment.service";
import { PersistenceClient } from "../../persistence/persistence.client";
import {
  MCP_READ_SCOPE,
  mcpResourceMatches,
  mcpScopes,
  oauthRedirectAllowed,
} from "./oauth-policy";
import {
  createOAuthProvider,
  MCP_OAUTH_FETCH,
  type OAuthSettings,
} from "./oauth-provider";
import { oauthStateHash } from "./oauth-state-crypto";

@Injectable()
export class McpAuthorizationService implements OnModuleInit {
  readonly settings: OAuthSettings | undefined;
  private provider: Provider | undefined;

  constructor(
    private readonly persistence: PersistenceClient,
    environment: EnvironmentService,
    @Inject(MCP_OAUTH_FETCH)
    private readonly providerFetch: typeof globalThis.fetch,
  ) {
    const issuer = environment.get("MCP_OAUTH_ISSUER");
    if (issuer)
      this.settings = {
        issuer,
        resource: `${issuer}/mcp`,
        uiOrigin: z.string().parse(environment.get("MCP_OAUTH_UI_ORIGIN")),
        stateKey: z.string().parse(environment.get("MCP_OAUTH_STATE_KEY")),
        jwks: z.string().parse(environment.get("MCP_OAUTH_JWKS")),
        trustProxy: environment.get("MCP_OAUTH_TRUST_PROXY") === "true",
      };
  }

  async onModuleInit() {
    if (this.settings)
      this.provider = await createOAuthProvider(
        this.settings,
        this.persistence,
        this.providerFetch,
      );
  }

  private configured() {
    if (!this.provider || !this.settings)
      throw new ServiceUnavailableException(
        "External MCP authorization is not configured",
      );
    return { provider: this.provider, settings: this.settings };
  }

  server() {
    return this.configured().provider;
  }

  private async interaction(id: string, req: Request, res: Response) {
    const { provider, settings } = this.configured();
    let interaction: Awaited<ReturnType<Provider["interactionDetails"]>>;
    try {
      interaction = await provider.interactionDetails(req, res);
    } catch {
      throw new BadRequestException(
        "Authorization request expired or does not belong to this browser",
      );
    }
    if (
      interaction.uid !== id ||
      interaction.result ||
      !["login", "consent"].includes(interaction.prompt.name)
    )
      throw new BadRequestException(
        "Authorization request is no longer available",
      );
    const params = z
      .object({
        client_id: z.string().min(1),
        redirect_uri: z.string(),
        scope: z.string(),
        resource: z.string(),
      })
      .safeParse(interaction.params);
    if (
      !params.success ||
      !oauthRedirectAllowed(params.data.redirect_uri) ||
      !mcpResourceMatches(params.data.resource, settings.resource)
    )
      throw new BadRequestException("Unsupported authorization request");
    let scopes: ReturnType<typeof mcpScopes>;
    try {
      scopes = mcpScopes(params.data.scope);
    } catch {
      throw new BadRequestException("Unsupported permissions");
    }
    const client = await provider.Client.find(params.data.client_id);
    if (!client) throw new BadRequestException("Client is no longer available");
    return {
      interaction,
      client,
      scopes,
      redirectUri: params.data.redirect_uri,
      resource: settings.resource,
    };
  }

  async preview(id: string, req: Request, res: Response) {
    const { interaction, client, scopes, redirectUri, resource } =
      await this.interaction(id, req, res);
    return McpConsentSchema.parse({
      id,
      clientId: client.clientId,
      clientName: client.clientName || "Aplicación sin nombre verificado",
      redirectUri,
      resource,
      scopes,
      expiresAt: new Date(interaction.exp * 1000).toISOString(),
    });
  }

  async decide(
    id: string,
    userId: string,
    approve: boolean,
    req: Request,
    res: Response,
    approvedWrites: string[] = [],
  ) {
    const {
      client,
      scopes: requested,
      resource,
    } = await this.interaction(id, req, res);
    if (
      approvedWrites.some(
        (scope) =>
          !requested.some((value) => value === scope) ||
          !FinancialWriteScopeSchema.safeParse(scope).success,
      )
    )
      throw new BadRequestException("Permission was not requested");
    const scopes = requested.filter(
      (scope) =>
        !FinancialWriteScopeSchema.safeParse(scope).success ||
        approvedWrites.includes(scope),
    );
    // Approval and denial compete for the same persisted single-use decision,
    // including across processes. Never replay an interrupted decision.
    const claimed = await this.persistence
      .mcpAuthorization()
      .mcpArtifacts.consume.mutate({
        model: "Interaction",
        key: oauthStateHash(id),
      });
    if (!claimed.consumed)
      throw new BadRequestException(
        "Authorization request has already been decided",
      );
    const provider = this.server();
    if (!approve)
      return {
        redirectTo: await provider.interactionResult(
          req,
          res,
          { error: "access_denied" },
          { mergeWithLastSubmission: false },
        ),
      };
    const grant = new provider.Grant({
      accountId: userId,
      clientId: client.clientId,
    });
    grant.addOIDCScope(scopes);
    grant.addResourceScope(
      resource,
      scopes.filter((scope) => scope.startsWith("finance:")).join(" "),
    );
    // Remember explicit scope denials so resume cannot prompt again or restore
    // requested-but-unselected write permissions from the authorization request.
    const rejected = requested.filter((scope) => !scopes.includes(scope));
    grant.rejectOIDCScope(rejected);
    grant.rejectResourceScope(resource, rejected);
    const grantId = await grant.save();
    await this.persistence.user(userId).mcpGrants.bind.mutate({
      id: grantId,
      key: oauthStateHash(grantId),
      interactionId: id,
      clientId: client.clientId,
      clientName: (
        client.clientName || "Aplicación sin nombre verificado"
      ).slice(0, 200),
      resource,
      scopes,
    });
    return {
      redirectTo: await provider.interactionResult(
        req,
        res,
        {
          login: { accountId: userId, remember: false },
          consent: { grantId },
        },
        { mergeWithLastSubmission: false },
      ),
    };
  }

  async authenticate(authorization: string | undefined) {
    if (!this.provider || !this.settings) return { status: "invalid" as const };
    const bearer = /^Bearer ([A-Za-z0-9._~-]{1,4096})$/i.exec(
      authorization ?? "",
    );
    if (!bearer) return { status: "invalid" as const };
    const token = await this.provider.AccessToken.find(bearer[1]);
    if (
      !token?.isValid ||
      token.tokenType !== "Bearer" ||
      token.isSenderConstrained() ||
      token.aud !== this.settings.resource ||
      !token.grantId
    )
      return { status: "invalid" as const };
    const grant = await this.persistence
      .mcpAuthorization()
      .mcpArtifacts.identity.query({ id: token.grantId });
    if (
      !grant ||
      grant.userId !== token.accountId ||
      grant.clientId !== token.clientId ||
      grant.resource !== this.settings.resource
    )
      return { status: "invalid" as const };
    if (
      !token.scopes.has(MCP_READ_SCOPE) ||
      !grant.scopes.includes(MCP_READ_SCOPE)
    )
      return { status: "insufficient" as const };
    const providerGrant = await this.provider.Grant.find(token.grantId);
    if (!providerGrant?.isValid || providerGrant.accountId !== grant.userId)
      return { status: "invalid" as const };
    return {
      status: "authorized" as const,
      userId: grant.userId,
      clientId: grant.clientId,
      grantId: token.grantId,
      scopes: [...token.scopes].filter((scope) => grant.scopes.includes(scope)),
    };
  }

  async originAllowed(origin: string | undefined, clientId: string) {
    if (!origin) return true; // Native and server-side clients do not send Origin.
    if (!this.provider || !this.settings) return false;
    if (origin === this.settings.issuer || origin === this.settings.uiOrigin)
      return true;
    const client = await this.provider.Client.find(clientId);
    return (client?.redirectUris ?? []).some(
      (uri) => new URL(uri).origin === origin,
    );
  }

  grants(userId: string) {
    return this.persistence.user(userId).mcpGrants.list.query();
  }

  async revoke(userId: string, id: string) {
    const result = await this.persistence
      .user(userId)
      .mcpGrants.revoke.mutate({ id });
    if (!result.revoked)
      throw new NotFoundException(
        "External-client grant is not available for this account",
      );
    return result;
  }
}
