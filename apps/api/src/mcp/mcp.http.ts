import { Controller, UseGuards } from "@nestjs/common";
import { McpHttpControllerFor } from "@rekog/mcp-nest";
import { Public } from "../auth/public.decorator";
import { McpAccessGuard } from "./authorization/mcp-access.guard";
import { mcpHttpTransport } from "./mcp.transport";

@Controller("mcp")
@Public()
@UseGuards(McpAccessGuard)
export class McpHttpController extends McpHttpControllerFor(mcpHttpTransport) {}
