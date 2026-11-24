import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { MCP_STRATEGY, McpStrategy } from "@rekog/mcp-nest";
import { AppModule } from "./app.module";
import { configureCors } from "./cors";
import { EnvironmentService } from "./environment/environment.service";
import { configureRequestBodies } from "./request-bodies";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureRequestBodies(app);
  app.enableShutdownHooks();
  app.getHttpServer().requestTimeout = 120000;
  app.getHttpServer().headersTimeout = 15000;

  const mcpStrategy = app.get<McpStrategy>(MCP_STRATEGY);
  mcpStrategy.setHttpAdapter(app.getHttpAdapter());
  app.connectMicroservice({ strategy: mcpStrategy });

  const environment = app.get(EnvironmentService);
  const port = environment.get("PORT");
  const host =
    environment.get("HOST") ??
    (environment.get("AUTH_PROVIDER") === "mock" ? "127.0.0.1" : undefined);
  configureCors(
    app,
    environment.get("CORS_ORIGINS"),
    environment.get("MCP_OAUTH_UI_ORIGIN"),
  );

  await app.startAllMicroservices();
  if (host) await app.listen(port, host);
  else await app.listen(port);

  const logger = new Logger("Bootstrap");
  logger.log(`Starting application at ${await app.getUrl()}`);
}

bootstrap();
