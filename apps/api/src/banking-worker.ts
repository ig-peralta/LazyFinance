import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { BankingSchedulingModule } from "./banking/scheduling/banking-scheduling.module";

/** No HTTP listener, public auth, MCP, assistant or AppModule dependency. */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(
    BankingSchedulingModule,
  );
  app.enableShutdownHooks();
}

void bootstrap();
