import type { MockLoginInput, MockLoginResult, VerifiedExternalIdentity } from '@lazyfinance/contracts';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { mockEmail, mockIdentity, mockPassword, mockToken } from './mock-auth.constants';

@Injectable()
export class MockAuthService {
  async login(input: MockLoginInput): Promise<MockLoginResult> {
    if (input.email !== mockEmail || input.password !== mockPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { token: mockToken };
  }

  verify(token: string): VerifiedExternalIdentity {
    if (token !== mockToken) throw new UnauthorizedException('Invalid mock identity');
    return mockIdentity;
  }
}
