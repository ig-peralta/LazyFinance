import { Global, Module } from '@nestjs/common';
import { MCP_STRATEGY, McpStrategy, StreamableHttpTransport } from '@rekog/mcp-nest';

const mcpStrategy = new McpStrategy({
  name: 'critical_finance',
  version: '1.0.0',
  transports: [
    new StreamableHttpTransport(),
  ],
});

@Global()
@Module({
  providers: [
    {
      provide: MCP_STRATEGY,
      useValue: mcpStrategy,
    },
  ],
  exports: [
    MCP_STRATEGY,
  ],
})
export class McpModule {}
