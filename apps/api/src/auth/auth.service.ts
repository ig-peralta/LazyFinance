import { MockLoginInputSchema, type AuthConfig, type AuthPrincipal, type MockLoginResult } from '@lazyfinance/contracts';
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EnvironmentService } from '../environment/environment.service';
import { MockAuthService } from './mock/mock-auth.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly environment: EnvironmentService,
    private readonly mock: MockAuthService,
  ) {}

  config(): AuthConfig {
    return { provider: this.environment.get('AUTH_PROVIDER') };
  }

  async loginMock(body: unknown): Promise<MockLoginResult> {
    if (this.config().provider !== 'mock') throw new NotFoundException();
    const parsed = MockLoginInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid login request');
    return this.mock.login(parsed.data);
  }

  async authenticate(authorization: string | undefined): Promise<AuthPrincipal> {
    const match = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i.exec(authorization?.trim() ?? '');
    if (!match) {
      throw new UnauthorizedException('Missing or invalid bearer token');
    }

    // LAZ-44 will map a verified Firebase subject to the internal user principal.
    // Until then, never fall back to a demo database token in Firebase mode.
    if (this.config().provider !== 'mock') throw new UnauthorizedException('Missing or invalid bearer token');
    return this.mock.authenticate(match[1]);
  }
}
