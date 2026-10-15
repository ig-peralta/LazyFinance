import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { DRIZZLE_PG_CLIENT } from '../drizzle/drizzle.tokens';
import type { AuthenticatedRequest } from './auth.types';

@Controller('api/probe')
class ProbeHttpController {
  @Get()
  getProbe(@Req() request: AuthenticatedRequest) {
    return request.user;
  }
}

describe('HTTP authentication', () => {
  const demoUser = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'demo@lazyfinance.local',
    name: 'Camila Rojas',
  };
  let app: INestApplication;
  let users: (typeof demoUser)[];
  let queries: number;

  beforeEach(async () => {
    users = [demoUser];
    queries = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              queries++;
              return users;
            },
          }),
        }),
      }),
    };

    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeHttpController],
    }).overrideProvider(DRIZZLE_PG_CLIENT).useValue(db).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('leaves the status route public', async () => {
    await request(app.getHttpServer()).get('/').expect(200).expect('listening');
    expect(queries).toBe(0);
  });

  it('rejects missing, malformed, and unknown credentials', async () => {
    await request(app.getHttpServer()).get('/api/probe').expect(401);
    await request(app.getHttpServer()).get('/api/probe').set('Authorization', 'Basic demo').expect(401);
    expect(queries).toBe(0);

    users = [];
    await request(app.getHttpServer()).get('/api/probe').set('Authorization', 'Bearer unknown-token').expect(401);
    expect(queries).toBe(1);
  });

  it('attaches the resolved principal to authenticated requests', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe')
      .set('Authorization', 'Bearer lazyfinance-demo-token')
      .expect(200);

    expect(response.body).toEqual({ userId: demoUser.id, email: demoUser.email, name: demoUser.name });
  });
});
