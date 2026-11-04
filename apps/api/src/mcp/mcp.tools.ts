import { MonthSchema } from '@lazyfinance/contracts';
import { McpContext } from '@rekog/mcp-nest';
import { BadRequestException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { z } from 'zod';
import { checkedMonth } from '../_utils/month-query';
import { santiagoMonth } from '../_utils/santiago-time';
import type { AuthenticatedRequest } from '../auth/auth.types';

export const readOnlyTool = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const monthParameters = z.object({
  month: MonthSchema.optional().describe(
    'Mes a consultar en formato YYYY-MM (zona America/Santiago). Omitir para usar el mes actual; no se aceptan meses futuros.',
  ),
});

export function mcpUserId(ctx: McpContext): string {
  const userId = ctx.getRawRequest<AuthenticatedRequest>()?.principal?.userId;
  if (!userId)
    throw new RpcException(
      'Se requiere una sesión autenticada para consultar datos financieros.',
    );
  return userId;
}

export function mcpMonth(month?: string): string {
  try {
    return checkedMonth(month ?? santiagoMonth(new Date()));
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    throw new RpcException(
      'El mes debe tener formato YYYY-MM y no puede ser futuro (zona America/Santiago).',
    );
  }
}
