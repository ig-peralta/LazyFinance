import type { AuthPrincipal, VerifiedExternalIdentity } from '@lazyfinance/contracts';
import { UnauthorizedException } from '@nestjs/common';
import { mockIdentity } from '../mock/mock-auth.constants';

export function testMockAuth(principals: Record<string, AuthPrincipal>) {
  const verify = (token: string): VerifiedExternalIdentity => {
    const principal = principals[token];
    if (!principal) throw new UnauthorizedException('Invalid mock identity');
    return {
      ...mockIdentity,
      providerSubject: token,
      verifiedEmail: principal.email,
      displayName: principal.name,
    };
  };

  const resolveExisting = async (identity: VerifiedExternalIdentity): Promise<AuthPrincipal> => {
    const principal = principals[identity.providerSubject];
    if (!principal || identity.provider !== 'mock' || identity.issuer !== mockIdentity.issuer) {
      throw new UnauthorizedException('External identity is not linked');
    }
    return principal;
  };

  return { verifier: { verify }, resolver: { resolveExisting } };
}
