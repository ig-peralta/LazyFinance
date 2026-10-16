import type { Request } from 'express';

export interface AuthPrincipal {
  userId: string;
  email: string;
  name: string;
}

export type AuthenticatedRequest = Request & { user: AuthPrincipal };
