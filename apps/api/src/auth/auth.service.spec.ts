import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { UserRepository } from '../drizzle/repositories/user.repository';
import { AuthService } from './auth.service';

function createService(record: { id: string; email: string; name: string } | null = null) {
  const findByApiToken = vi.fn(async (_token: string) => record);
  const service = new AuthService({ findByApiToken } as unknown as UserRepository);

  return { service, findByApiToken };
}

describe('AuthService', () => {
  it.each([undefined, '', 'Basic token', 'Bearer', 'Bearer first second', 'Bearer token,other'])(
    'rejects a missing or malformed Authorization header: %s',
    async (authorization) => {
      const { service, findByApiToken } = createService();

      await expect(service.authenticate(authorization)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(findByApiToken).not.toHaveBeenCalled();
    },
  );

  it('rejects a bearer token that does not belong to a user', async () => {
    const { service, findByApiToken } = createService();

    await expect(service.authenticate('Bearer unknown-token')).rejects.toMatchObject({ status: 401 });
    expect(findByApiToken).toHaveBeenCalledWith('unknown-token');
  });

  it('returns the internal user identity for a valid token', async () => {
    const record = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'demo@lazyfinance.local',
      name: 'Camila Rojas',
    };
    const { service, findByApiToken } = createService(record);

    await expect(service.authenticate('bearer lazyfinance-demo-token')).resolves.toEqual({
      userId: record.id,
      email: record.email,
      name: record.name,
    });
    expect(findByApiToken).toHaveBeenCalledExactlyOnceWith('lazyfinance-demo-token');
  });
});
