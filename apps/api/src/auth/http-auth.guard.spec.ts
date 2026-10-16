import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { configureCors } from '../cors';
import { DRIZZLE_PG_CLIENT } from '../drizzle/drizzle.tokens';
import { ENV_SCHEMA } from '../environment/environment.schema';
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
    configureCors(app, ENV_SCHEMA.parse({}).CORS_ORIGINS);
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

  it('returns the principal only for a valid bearer token', async () => {
    await request(app.getHttpServer()).get('/auth/principal').expect(401);

    const response = await request(app.getHttpServer())
      .get('/auth/principal')
      .set('Authorization', 'Bearer lazyfinance-demo-token')
      .expect(200);

    expect(response.body).toEqual({ userId: demoUser.id, email: demoUser.email, name: demoUser.name });
    expect(response.body).not.toHaveProperty('apiToken');
  });

  it('allows the UI origin to preflight Authorization headers', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/probe')
      .set('Origin', 'http://localhost:4200')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:4200');
    expect(response.headers['access-control-allow-headers']).toContain('authorization');
    expect(queries).toBe(0);
  });

  it('does not grant cross-origin access to unlisted origins', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/probe')
      .set('Origin', 'https://unlisted.example')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('includes CORS headers on protected error responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe')
      .set('Origin', 'http://127.0.0.1:4200')
      .expect(401);

    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:4200');
  });
});
