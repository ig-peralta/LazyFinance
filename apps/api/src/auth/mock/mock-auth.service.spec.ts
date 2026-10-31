import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { UserRepository } from '../../drizzle/repositories/user.repository';
import { MockAuthService } from './mock-auth.service';

const demoUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'demo@lazyfinance.local',
  name: 'Camila Rojas',
};

function createService(record: typeof demoUser | null = demoUser) {
  const findByApiToken = vi.fn(async (_token: string) => record);
  const service = new MockAuthService({ findByApiToken } as unknown as UserRepository);
  return { service, findByApiToken };
}

describe('MockAuthService', () => {
  it('issues the seeded mock user token after checking local credentials', async () => {
    const { service, findByApiToken } = createService();
    await expect(service.login({ email: demoUser.email, password: 'lazyfinance-local-password' }))
      .resolves.toEqual({ token: 'lazyfinance-demo-token' });
    expect(findByApiToken).toHaveBeenCalledExactlyOnceWith('lazyfinance-demo-token');
  });

  it('rejects incorrect credentials without querying for an account', async () => {
    const { service, findByApiToken } = createService();
    await expect(service.login({ email: demoUser.email, password: 'wrong' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.login({ email: 'other@example.com', password: 'lazyfinance-local-password' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(findByApiToken).not.toHaveBeenCalled();
  });

  it('refuses a login if the seeded user is unavailable or does not match', async () => {
    await expect(createService(null).service.login({ email: demoUser.email, password: 'lazyfinance-local-password' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    await expect(createService({ ...demoUser, email: 'other@example.com' }).service.login({
      email: demoUser.email, password: 'lazyfinance-local-password',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns an internal principal for a known token, and rejects an unknown token', async () => {
    await expect(createService().service.authenticate('lazyfinance-demo-token')).resolves.toEqual({
      userId: demoUser.id, email: demoUser.email, name: demoUser.name,
    });
    await expect(createService(null).service.authenticate('unknown'))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
