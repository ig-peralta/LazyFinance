import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { DRIZZLE_PG_CLIENT } from '../drizzle/drizzle.tokens';
import { UserRepository } from '../drizzle/repositories/user.repository';
import { TransactionsService } from './transactions.service';

describe('GET /transactions/recent', () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const transactions = [{
    id: '00000000-0000-4000-8000-000000000011',
    bookedAt: '2026-10-15T15:00:00.000Z',
    amount: '-49990.00',
    type: 'debit',
    merchant: 'Netflix',
    description: null,
    account: { id: '00000000-0000-4000-8000-000000000021', alias: 'Tarjeta', type: 'credit_card', currency: 'CLP' },
    tags: [{ id: '00000000-0000-4000-8000-000000000031', name: 'Suscripciones', color: '#7C3AED' }],
  }];
  const getRecentForUser = vi.fn(async (id: string) => id === userId ? transactions : []);
  let app: INestApplication;

  beforeEach(async () => {
    getRecentForUser.mockClear();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_PG_CLIENT).useValue({})
      .overrideProvider(UserRepository).useValue({
        findByApiToken: async (token: string) => token === 'demo-token'
          ? { id: userId, email: 'demo@lazyfinance.local', name: 'Camila Rojas' }
          : token === 'other-token'
            ? { id: '00000000-0000-4000-8000-000000000002', email: 'other@lazyfinance.local', name: 'Otro' }
            : null,
      })
      .overrideProvider(TransactionsService).useValue({ getRecentForUser })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires valid authentication before querying transactions', async () => {
    await request(app.getHttpServer()).get('/transactions/recent').expect(401);
    await request(app.getHttpServer()).get('/transactions/recent').set('Authorization', 'Bearer invalid').expect(401);
    expect(getRecentForUser).not.toHaveBeenCalled();
  });

  it('scopes the read to the authenticated principal', async () => {
    const response = await request(app.getHttpServer())
      .get('/transactions/recent')
      .set('Authorization', 'Bearer demo-token')
      .expect(200);

    expect(response.body).toEqual(transactions);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(getRecentForUser).toHaveBeenCalledWith(userId);

    await request(app.getHttpServer())
      .get('/transactions/recent')
      .set('Authorization', 'Bearer other-token')
      .expect(200, []);
    expect(getRecentForUser).toHaveBeenLastCalledWith('00000000-0000-4000-8000-000000000002');
  });
});
