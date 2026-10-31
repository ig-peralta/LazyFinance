import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { EnvironmentService } from '../environment/environment.service';
import type { MockAuthService } from './mock/mock-auth.service';
import { AuthService } from './auth.service';

const principal = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'demo@lazyfinance.local',
  name: 'Camila Rojas',
};

function createService(provider: 'firebase' | 'mock' = 'mock') {
  const authenticate = vi.fn(async (_token: string) => principal);
  const login = vi.fn(async () => ({ token: 'lazyfinance-demo-token' }));
  const mock = { authenticate, login } as unknown as MockAuthService;
  const environment = { get: () => provider } as unknown as EnvironmentService;
  const service = new AuthService(environment, mock);
  return { service, authenticate, login };
}

describe('AuthService', () => {
  it.each([undefined, '', 'Basic token', 'Bearer', 'Bearer first second', 'Bearer token,other'])(
    'rejects a missing or malformed Authorization header: %s',
    async (authorization) => {
      const { service, authenticate } = createService();
      await expect(service.authenticate(authorization)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authenticate).not.toHaveBeenCalled();
    },
  );

  it('returns the internal principal only through the selected mock provider', async () => {
    const { service, authenticate } = createService();
    await expect(service.authenticate('bearer lazyfinance-demo-token')).resolves.toEqual(principal);
    expect(authenticate).toHaveBeenCalledExactlyOnceWith('lazyfinance-demo-token');
  });

  it('does not accept a demo bearer token in Firebase mode', async () => {
    const { service, authenticate } = createService('firebase');
    expect(service.config()).toEqual({ provider: 'firebase' });
    await expect(service.authenticate('Bearer lazyfinance-demo-token'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('rejects malformed mock login requests and hides the mock endpoint in Firebase mode', async () => {
    const mock = createService();
    await expect(mock.service.loginMock({ email: principal.email })).rejects.toBeInstanceOf(BadRequestException);
    expect(mock.login).not.toHaveBeenCalled();

    const firebase = createService('firebase');
    await expect(firebase.service.loginMock({})).rejects.toBeInstanceOf(NotFoundException);
    expect(firebase.login).not.toHaveBeenCalled();
  });

  it('delegates valid mock credentials only in mock mode', async () => {
    const { service, login } = createService();
    const credentials = { email: principal.email, password: 'local-password' };
    await expect(service.loginMock(credentials)).resolves.toEqual({ token: 'lazyfinance-demo-token' });
    expect(login).toHaveBeenCalledExactlyOnceWith(credentials);
  });
});
