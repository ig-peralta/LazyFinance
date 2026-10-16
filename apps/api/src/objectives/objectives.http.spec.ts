import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { DRIZZLE_PG_CLIENT } from '../drizzle/drizzle.tokens';
import { UserRepository } from '../drizzle/repositories/user.repository';
import { ObjectivesService } from './objectives.service';

describe('GET /objectives', () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const items = [{
    id: '00000000-0000-4000-8000-000000000041', name: 'Supermercado', amount: '280000.00',
    kind: 'time_based', intent: 'spending', isRecurring: true, period: 'monthly',
    startDate: '2024-01-01T15:00:00.000Z', endDate: null, tags: [],
  }];
  const getForUser = vi.fn(async (id: string) => id === userId ? items : []);
  const getSpendingProgressForUser = vi.fn(async () => []);
  let app: INestApplication;

  beforeEach(async () => {
    getForUser.mockClear();
    getSpendingProgressForUser.mockClear();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_PG_CLIENT).useValue({})
      .overrideProvider(UserRepository).useValue({
        findByApiToken: async (token: string) => token === 'demo-token'
          ? { id: userId, email: 'demo@lazyfinance.local', name: 'Camila Rojas' }
          : token === 'other-token'
            ? { id: '00000000-0000-4000-8000-000000000002', email: 'other@lazyfinance.local', name: 'Otro' }
            : null,
      })
      .overrideProvider(ObjectivesService).useValue({ getForUser, getSpendingProgressForUser })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => app.close());

  it('requires authentication before looking up objectives', async () => {
    await request(app.getHttpServer()).get('/objectives').expect(401);
    expect(getForUser).not.toHaveBeenCalled();
  });

  it('returns only objectives belonging to the authenticated user', async () => {
    const response = await request(app.getHttpServer())
      .get('/objectives').set('Authorization', 'Bearer demo-token').expect(200);
    expect(response.body).toEqual(items);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(getForUser).toHaveBeenCalledWith(userId);

    await request(app.getHttpServer())
      .get('/objectives').set('Authorization', 'Bearer other-token').expect(200, []);
    expect(getForUser).toHaveBeenLastCalledWith('00000000-0000-4000-8000-000000000002');
  });

  it('validates and scopes spending progress requests', async () => {
    await request(app.getHttpServer()).get('/objectives/spending-progress?month=2026-09').expect(401);
    await request(app.getHttpServer()).get('/objectives/spending-progress?month=2026-13')
      .set('Authorization', 'Bearer demo-token').expect(400);
    await request(app.getHttpServer()).get('/objectives/spending-progress?month=9999-12')
      .set('Authorization', 'Bearer demo-token').expect(400);
    const response = await request(app.getHttpServer()).get('/objectives/spending-progress?month=2026-09')
      .set('Authorization', 'Bearer demo-token').expect(200, []);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(getSpendingProgressForUser).toHaveBeenCalledWith(userId, '2026-09');
  });
});
