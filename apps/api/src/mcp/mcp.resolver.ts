import { type CallToolResult } from '@modelcontextprotocol/sdk/types';
import { Resolver, Tool } from '@nestjs-mcp/server';

@Resolver()
export class McpResolver {
  @Tool({
    name: 'server_healthcheck',
    description: 'Check the health of the server'
  })
  healthcheck(): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: 'Server is healthy',
        },
      ],
    };
  }

  @Tool({
    name: 'get_user_balance',
    description: 'Get the balance of the user'
  })
  checkBalance(): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: 'User balance is $90',
        },
      ],
    };
  }
}
