import type { AuthPrincipal, MockLoginInput, MockLoginResult } from '@lazyfinance/contracts';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserRepository } from '../../drizzle/repositories/user.repository';

const mockEmail = 'demo@lazyfinance.local';
const mockPassword = 'lazyfinance-local-password';
const mockToken = 'lazyfinance-demo-token';

@Injectable()
export class MockAuthService {
  constructor(private readonly users: UserRepository) {}

  async login(input: MockLoginInput): Promise<MockLoginResult> {
    if (input.email !== mockEmail || input.password !== mockPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.users.findByApiToken(mockToken);
    if (!user || user.email !== mockEmail) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { token: mockToken };
  }

  async authenticate(token: string): Promise<AuthPrincipal> {
    const user = await this.users.findByApiToken(token);
    if (!user) throw new UnauthorizedException('Missing or invalid bearer token');
    return { userId: user.id, email: user.email, name: user.name };
  }
}
