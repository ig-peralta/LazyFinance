import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { DRIZZLE_PG_CLIENT } from '../drizzle/drizzle.tokens';
import { UserRepository } from '../drizzle/repositories/user.repository';
import { SummariesService } from './summaries.service';

describe('GET /summaries/monthly', () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const getMonthlyForUser = vi.fn(async (_userId: string, month: string) => ({
    month, receivedIncome: '1550000.00', spending: '700000.00', tags: [],
    expectedIncome: { amount: '1600000.00', estimatedAmount: '0.00', unknownAmountCount: 0, paymentCount: 1 },
    unclassifiedCredits: { amount: '0.00', count: 0 },
  }));
  const getComparisonForUser = vi.fn(async (_userId: string, month: string) => ({
    month, previousMonth: '2026-08', partial: false,
    receivedIncome: { current: '1550000.00', previous: '1500000.00', change: '50000.00' },
    spending: { current: '700000.00', previous: '600000.00', change: '100000.00' },
  }));
  let app: INestApplication;

  beforeEach(async () => {
    getMonthlyForUser.mockClear();
    getComparisonForUser.mockClear();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_PG_CLIENT).useValue({})
      .overrideProvider(UserRepository).useValue({
        findByApiToken: async (token: string) => token === 'demo-token'
          ? { id: userId, email: 'demo@lazyfinance.local', name: 'Camila' }
          : null,
      })
      .overrideProvider(SummariesService).useValue({ getMonthlyForUser, getComparisonForUser })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => app.close());

  it('rejects missing credentials and malformed months', async () => {
    await request(app.getHttpServer()).get('/summaries/monthly?month=2026-09').expect(401);
    for (const month of ['2026-13', '2026-9', '2026-00', 'x']) {
      await request(app.getHttpServer()).get(`/summaries/monthly?month=${month}`)
        .set('Authorization', 'Bearer demo-token').expect(400);
    }
    await request(app.getHttpServer()).get('/summaries/monthly')
      .set('Authorization', 'Bearer demo-token').expect(400);
    await request(app.getHttpServer()).get('/summaries/monthly?month=9999-12')
      .set('Authorization', 'Bearer demo-token').expect(400);
    expect(getMonthlyForUser).not.toHaveBeenCalled();
  });

  it('returns only the authenticated user’s selected month', async () => {
    const response = await request(app.getHttpServer()).get('/summaries/monthly?month=2026-09')
      .set('Authorization', 'Bearer demo-token').expect(200);
    expect(response.body).toEqual({
      month: '2026-09', receivedIncome: '1550000.00', spending: '700000.00', tags: [],
      expectedIncome: { amount: '1600000.00', estimatedAmount: '0.00', unknownAmountCount: 0, paymentCount: 1 },
      unclassifiedCredits: { amount: '0.00', count: 0 },
    });
    expect(response.body).not.toHaveProperty('income');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(getMonthlyForUser).toHaveBeenCalledWith(userId, '2026-09');
  });

  it('validates and scopes period comparisons', async () => {
    await request(app.getHttpServer()).get('/summaries/comparison?month=2026-09').expect(401);
    await request(app.getHttpServer()).get('/summaries/comparison?month=bad')
      .set('Authorization', 'Bearer demo-token').expect(400);
    await request(app.getHttpServer()).get('/summaries/comparison?month=9999-12')
      .set('Authorization', 'Bearer demo-token').expect(400);
    const response = await request(app.getHttpServer()).get('/summaries/comparison?month=2026-09')
      .set('Authorization', 'Bearer demo-token').expect(200);
    expect(response.body.previousMonth).toBe('2026-08');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(getComparisonForUser).toHaveBeenCalledWith(userId, '2026-09');
  });
});
