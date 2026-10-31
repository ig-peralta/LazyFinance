import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { mockIdentity } from './mock-auth.constants';
import { MockAuthService } from './mock-auth.service';

describe('MockAuthService', () => {
  const service = new MockAuthService();

  it('issues a local mock-provider token for the development fixture credentials', async () => {
    await expect(service.login({ email: 'demo@lazyfinance.cl', password: 'password' }))
      .resolves.toEqual({ token: 'lazyfinance-demo-token' });
  });

  it('rejects incorrect fixture credentials', async () => {
    await expect(service.login({ email: 'demo@lazyfinance.cl', password: 'wrong' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.login({ email: 'other@example.com', password: 'password' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verifies a mock provider subject instead of returning a database user', () => {
    expect(service.verify('lazyfinance-demo-token')).toEqual(mockIdentity);
    expect(service.verify('lazyfinance-demo-token')).not.toHaveProperty('userId');
    expect(() => service.verify('unknown-token')).toThrow(UnauthorizedException);
  });
});
