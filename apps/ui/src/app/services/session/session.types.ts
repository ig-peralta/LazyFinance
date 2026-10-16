import type { AuthPrincipal } from '@lazyfinance/contracts';

export type SessionState = { user: AuthPrincipal; token: string } | null;
