import { NestFactory } from '@nestjs/core';
import { MCP_STRATEGY, McpStrategy } from '@rekog/mcp-nest';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const mcpStrategy = app.get<McpStrategy>(MCP_STRATEGY);
  mcpStrategy.setHttpAdapter(app.getHttpAdapter());
  app.connectMicroservice({ strategy: mcpStrategy });
  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
