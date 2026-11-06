import { MockLoginInputSchema, type AuthConfig, type AuthPrincipal, type MockLoginResult } from '@lazyfinance/contracts';
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EnvironmentService } from '../environment/environment.service';
import { ExternalIdentityRepository } from '../persistence/repositories/external-identity.repository';
import { FirebaseAuthService } from './firebase/firebase-auth.service';
import { MockAuthService } from './mock/mock-auth.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly environment: EnvironmentService,
    private readonly mock: MockAuthService,
    private readonly firebase: FirebaseAuthService,
    private readonly identities: ExternalIdentityRepository,
  ) {}

  config(): AuthConfig {
    return { provider: this.environment.get('AUTH_PROVIDER') };
  }

  async loginMock(body: unknown): Promise<MockLoginResult> {
    if (this.config().provider !== 'mock') throw new NotFoundException();
    const parsed = MockLoginInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid login request');
    const result = await this.mock.login(parsed.data);
    await this.identities.resolveExisting(this.mock.verify(result.token));
    return result;
  }

  async authenticate(authorization: string | undefined): Promise<AuthPrincipal> {
    const match = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i.exec(authorization?.trim() ?? '');
    if (!match) {
      throw new UnauthorizedException('Missing or invalid bearer token');
    }

    const token = match[1]
    switch (this.config().provider) {
      case 'mock':
        const identity = this.mock.verify(token)
        return this.identities.resolveExisting(identity);
      case 'firebase': {
        const identity = await this.firebase.verify(token);
        return this.identities.resolveOrCreate(identity);
      }
    }
  }
}
