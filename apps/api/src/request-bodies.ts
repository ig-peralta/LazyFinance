import type { NestExpressApplication } from "@nestjs/platform-express";

export function configureRequestBodies(app: NestExpressApplication) {
  // The OAuth bridge intentionally uses oidc-provider's supported parsed-body
  // fallback to enforce resource policy before protocol dispatch. Keep its 56 KiB
  // budget and repeated form values; unrelated tRPC requests retain their budget.
  app.useBodyParser("json", {
    limit: 56 * 1024,
    type: (req) =>
      (req.url ?? "").startsWith("/oauth/") &&
      /^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? ""),
  });
  app.useBodyParser("json", { limit: 1024 * 1024 });
  app.useBodyParser("urlencoded", { limit: 56 * 1024, extended: false });
}
