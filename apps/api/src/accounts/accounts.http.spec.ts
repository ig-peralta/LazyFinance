import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { DRIZZLE_PG_CLIENT } from '../drizzle/drizzle.tokens';
import { AccountRepository } from '../drizzle/repositories/account.repository';
import { ExternalIdentityRepository } from '../drizzle/repositories/external-identity.repository';
import { MockAuthService } from '../auth/mock/mock-auth.service';
import { testMockAuth } from '../auth/testing/mock-auth-fixtures';

describe('GET /accounts', () => {
  const demoUser = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'demo@lazyfinance.cl',
    name: 'Camila Rojas',
  };
  const accounts = [{
    id: '00000000-0000-4000-8000-000000000002',
    alias: 'Cuenta corriente',
    type: 'checking',
    currency: 'CLP',
    balance: '125000.00',
    lastSyncedAt: null,
  }];
  const listActiveForUser = vi.fn(async (userId: string) => userId === demoUser.id ? accounts : []);
  let app: INestApplication;

  beforeEach(async () => {
    listActiveForUser.mockClear();
    const { verifier, resolver } = testMockAuth({
      'demo-token': { userId: demoUser.id, email: demoUser.email, name: demoUser.name },
      'other-token': { userId: '00000000-0000-4000-8000-000000000003', email: 'other@lazyfinance.local', name: 'Otro' },
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_PG_CLIENT).useValue({})
      .overrideProvider(MockAuthService).useValue(verifier)
      .overrideProvider(ExternalIdentityRepository).useValue(resolver)
      .overrideProvider(AccountRepository).useValue({ listActiveForUser })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires a valid bearer token', async () => {
    await request(app.getHttpServer()).get('/accounts').expect(401);
    await request(app.getHttpServer()).get('/accounts').set('Authorization', 'Bearer invalid').expect(401);
    expect(listActiveForUser).not.toHaveBeenCalled();
  });

  it('uses the authenticated principal to list accounts', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', 'Bearer demo-token')
      .expect(200);

    expect(response.body).toEqual(accounts);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(listActiveForUser).toHaveBeenCalledWith(demoUser.id);

    await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', 'Bearer other-token')
      .expect(200, []);
    expect(listActiveForUser).toHaveBeenLastCalledWith('00000000-0000-4000-8000-000000000003');
  });
});
