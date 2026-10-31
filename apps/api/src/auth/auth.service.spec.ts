import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ExternalIdentityRepository } from '../drizzle/repositories/external-identity.repository';
import type { EnvironmentService } from '../environment/environment.service';
import type { FirebaseAuthService } from './firebase/firebase-auth.service';
import type { MockAuthService } from './mock/mock-auth.service';
import { mockIdentity } from './mock/mock-auth.constants';
import { AuthService } from './auth.service';

const principal = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'demo@lazyfinance.cl',
  name: 'Camila Rojas',
};
const identity = {
  provider: 'firebase',
  issuer: 'https://securetoken.google.com/lazyfinance-dev',
  providerSubject: 'firebase-user-1',
  verifiedEmail: 'first@example.com',
  displayName: 'First User',
};

function createService(provider: 'firebase' | 'mock' = 'mock') {
  const mockVerify = vi.fn((token: string) => {
    if (token !== 'lazyfinance-demo-token') throw new UnauthorizedException('Invalid mock identity');
    return mockIdentity;
  });
  const login = vi.fn(async () => ({ token: 'lazyfinance-demo-token' }));
  const mock = { verify: mockVerify, login } as unknown as MockAuthService;
  const verify = vi.fn(async (token: string) => {
    if (token === 'lazyfinance-demo-token') throw new UnauthorizedException('Invalid Firebase ID token');
    return identity;
  });
  const resolveOrCreate = vi.fn(async () => principal);
  const resolveExisting = vi.fn(async () => principal);
  const environment = { get: () => provider } as unknown as EnvironmentService;
  const service = new AuthService(environment, mock, { verify } as unknown as FirebaseAuthService,
    { resolveOrCreate, resolveExisting } as unknown as ExternalIdentityRepository);
  return { service, mockVerify, login, verify, resolveOrCreate, resolveExisting };
}

describe('AuthService', () => {
  it.each([undefined, '', 'Basic token', 'Bearer', 'Bearer first second', 'Bearer token,other'])(
    'rejects a missing or malformed Authorization header: %s',
    async (authorization) => {
      const { service, mockVerify } = createService();
      await expect(service.authenticate(authorization)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(mockVerify).not.toHaveBeenCalled();
    },
  );

  it('returns the internal principal only through the selected mock provider', async () => {
    const { service, mockVerify, resolveExisting } = createService();
    await expect(service.authenticate('bearer lazyfinance-demo-token')).resolves.toEqual(principal);
    expect(mockVerify).toHaveBeenCalledExactlyOnceWith('lazyfinance-demo-token');
    expect(resolveExisting).toHaveBeenCalledExactlyOnceWith(mockIdentity);
  });

  it('does not accept a demo bearer token in Firebase mode', async () => {
    const { service, mockVerify, verify, resolveOrCreate } = createService('firebase');
    expect(service.config()).toEqual({ provider: 'firebase' });
    await expect(service.authenticate('Bearer lazyfinance-demo-token'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(verify).toHaveBeenCalledExactlyOnceWith('lazyfinance-demo-token');
    expect(resolveOrCreate).not.toHaveBeenCalled();
  });

  it('maps a verified Firebase subject to the shared internal principal', async () => {
    const { service, mockVerify, verify, resolveOrCreate } = createService('firebase');
    await expect(service.authenticate('Bearer signed-firebase-token')).resolves.toEqual(principal);
    expect(verify).toHaveBeenCalledExactlyOnceWith('signed-firebase-token');
    expect(resolveOrCreate).toHaveBeenCalledExactlyOnceWith(identity);
    expect(mockVerify).not.toHaveBeenCalled();
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
    const { service, login, mockVerify, resolveExisting } = createService();
    const credentials = { email: principal.email, password: 'password' };
    await expect(service.loginMock(credentials)).resolves.toEqual({ token: 'lazyfinance-demo-token' });
    expect(login).toHaveBeenCalledExactlyOnceWith(credentials);
    expect(mockVerify).toHaveBeenCalledExactlyOnceWith('lazyfinance-demo-token');
    expect(resolveExisting).toHaveBeenCalledExactlyOnceWith(mockIdentity);
  });

  it('cannot issue a usable mock session without the seeded external identity link', async () => {
    const { service, resolveExisting } = createService();
    resolveExisting.mockRejectedValueOnce(new UnauthorizedException('External identity is not linked'));
    await expect(service.loginMock({ email: principal.email, password: 'password' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
