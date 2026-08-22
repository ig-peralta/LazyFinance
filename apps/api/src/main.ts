import { NestFactory } from '@nestjs/core';
import { MCP_STRATEGY, McpStrategy } from '@rekog/mcp-nest';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { EnvVariables } from './config';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const mcpStrategy = app.get<McpStrategy>(MCP_STRATEGY);
  mcpStrategy.setHttpAdapter(app.getHttpAdapter());
  app.connectMicroservice({ strategy: mcpStrategy });

  const configService = app.get(ConfigService<EnvVariables, true>);
  const port = configService.get('PORT', { infer: true });

  await app.startAllMicroservices();
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Starting application at ${await app.getUrl()}`);
}
bootstrap();
