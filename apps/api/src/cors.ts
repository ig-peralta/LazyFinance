import type { INestApplication } from "@nestjs/common";
import type { CorsOptionsDelegate } from "@nestjs/common/interfaces/external/cors-options.interface";

export function configureCors(
  app: INestApplication,
  allowedOrigins: string[],
  interactionOrigin?: string,
): void {
  const policy: CorsOptionsDelegate<{ url?: string }> = (request, callback) => {
    const path = (request.url ?? "").split("?", 1)[0];
    const interaction = path.startsWith("/oauth/interaction/");
    const protocol =
      path === "/mcp" ||
      path.startsWith("/.well-known/") ||
      (path.startsWith("/oauth/") && !interaction);
    callback(
      null,
      protocol
        ? {
            // These endpoints authenticate explicit OAuth credentials, never browser
            // session cookies. MCP requests also validate Origin after token admission.
            origin: "*",
            credentials: false,
            exposedHeaders: [
              "WWW-Authenticate",
              "Mcp-Session-Id",
              "Mcp-Protocol-Version",
            ],
          }
        : {
            origin: interaction
              ? interactionOrigin
                ? [interactionOrigin]
                : []
              : allowedOrigins,
            credentials: interaction,
          },
    );
  };
  app.enableCors(policy);
}
