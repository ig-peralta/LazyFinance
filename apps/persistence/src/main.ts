import "reflect-metadata";
import "dotenv/config";
import { MAX_PERSISTENCE_RPC_BYTES } from "@lazyfinance/contracts/internal";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser("json", { limit: MAX_PERSISTENCE_RPC_BYTES });
  app.enableShutdownHooks();
  const server = app.getHttpServer();
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  await app.listen(
    Number(process.env.PORT ?? 3001),
    process.env.HOST ?? "127.0.0.1",
  );
  process.send?.({ url: await app.getUrl() });
}
void bootstrap();
