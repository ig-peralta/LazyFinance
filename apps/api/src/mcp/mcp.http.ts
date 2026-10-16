import { Controller } from '@nestjs/common';
import { McpHttpControllerFor } from '@rekog/mcp-nest';
import { mcpHttpTransport } from './mcp.transport';

@Controller('mcp')
export class McpHttpController extends McpHttpControllerFor(mcpHttpTransport) {}
