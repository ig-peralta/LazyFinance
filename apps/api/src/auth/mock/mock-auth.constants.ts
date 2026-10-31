import type { VerifiedExternalIdentity } from '@lazyfinance/contracts';

export const mockEmail = 'demo@lazyfinance.cl';
export const mockPassword = 'password';
export const mockToken = 'lazyfinance-demo-token';

export const mockIdentity = {
  provider: 'mock',
  issuer: 'https://mock.lazyfinance.cl',
  providerSubject: 'demo',
  verifiedEmail: mockEmail,
  displayName: 'Camila Rojas',
} as const satisfies VerifiedExternalIdentity;
