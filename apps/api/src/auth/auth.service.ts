import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserRepository } from '../drizzle/repositories/user.repository';
import type { AuthPrincipal } from './auth.principal';

@Injectable()
export class AuthService {
  constructor(private readonly users: UserRepository) {}

  async authenticate(authorization: string | undefined): Promise<AuthPrincipal> {
    const match = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i.exec(authorization?.trim() ?? '');
    if (!match) {
      throw new UnauthorizedException('Missing or invalid bearer token');
    }

    const account = await this.users.findByApiToken(match[1]);

    if (!account) {
      throw new UnauthorizedException('Missing or invalid bearer token');
    }

    return { userId: account.id, email: account.email, name: account.name };
  }
}
