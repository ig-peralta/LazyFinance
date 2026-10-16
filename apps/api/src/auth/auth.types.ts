import type { AuthPrincipal } from '@lazyfinance/contracts';
import type { Request } from 'express';

export type AuthenticatedRequest = Request & { principal: AuthPrincipal };
