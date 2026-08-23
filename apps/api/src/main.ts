import { NestFactory } from '@nestjs/core';
import { MCP_STRATEGY, McpStrategy } from '@rekog/mcp-nest';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { EnvironmentService } from './environment/environment.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const mcpStrategy = app.get<McpStrategy>(MCP_STRATEGY);
  mcpStrategy.setHttpAdapter(app.getHttpAdapter());
  app.connectMicroservice({ strategy: mcpStrategy });

  const environment = app.get(EnvironmentService);
  const port = environment.get('PORT');

  await app.startAllMicroservices();
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Starting application at ${await app.getUrl()}`);
}
bootstrap();
