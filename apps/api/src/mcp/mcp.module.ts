import { Global, Module } from '@nestjs/common';
import { MCP_STRATEGY, McpStrategy } from '@rekog/mcp-nest';
import { McpHttpController } from './mcp.http';
import { mcpHttpTransport } from './mcp.transport';

const mcpStrategy = new McpStrategy({
  name: 'lazyfinance',
  version: '1.0.0',
  transports: [mcpHttpTransport],
});

@Global()
@Module({
  controllers: [McpHttpController],
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
