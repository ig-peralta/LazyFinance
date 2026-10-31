import { Controller, Get, INestApplication, Req, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { configureCors } from '../cors';
import { DRIZZLE_PG_CLIENT } from '../drizzle/drizzle.tokens';
import { ExternalIdentityRepository } from '../drizzle/repositories/external-identity.repository';
import { ENV_SCHEMA } from '../environment/environment.schema';
import { EnvironmentService } from '../environment/environment.service';
import { mockIdentity } from './mock/mock-auth.constants';
import type { AuthenticatedRequest } from './auth.types';

@Controller('api/probe')
class ProbeHttpController {
  @Get()
  getProbe(@Req() request: AuthenticatedRequest) {
    return request.principal;
  }
}

describe('HTTP authentication', () => {
  const demoUser = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'demo@lazyfinance.cl',
    name: 'Camila Rojas',
  };
  let app: INestApplication;
  let users: (typeof demoUser)[];
  let queries: number;

  beforeEach(async () => {
    users = [demoUser];
    queries = 0;
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeHttpController],
    }).overrideProvider(DRIZZLE_PG_CLIENT).useValue({})
      .overrideProvider(ExternalIdentityRepository).useValue({
        resolveExisting: async (identity: typeof mockIdentity) => {
          queries++;
          if (identity.providerSubject !== mockIdentity.providerSubject || !users.length) {
            throw new UnauthorizedException('External identity is not linked');
          }
          return { userId: users[0].id, email: users[0].email, name: users[0].name };
        },
      }).compile();

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
    expect(queries).toBe(0);
    await request(app.getHttpServer()).get('/api/probe')
      .set('Authorization', 'Bearer lazyfinance-demo-token').expect(401);
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
    expect(response.body).not.toHaveProperty('providerSubject');
  });

  it('advertises the mock provider publicly without disclosing credentials', async () => {
    const response = await request(app.getHttpServer()).get('/auth/config').expect(200);
    expect(response.body).toEqual({ provider: 'mock' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(queries).toBe(0);
  });

  it('logs in with local credentials only when the demo user is seeded', async () => {
    await request(app.getHttpServer()).post('/auth/mock/login')
      .send({ email: demoUser.email, password: 'wrong' }).expect(401);
    await request(app.getHttpServer()).post('/auth/mock/login')
      .send({ email: demoUser.email }).expect(400);
    expect(queries).toBe(0);

    const response = await request(app.getHttpServer()).post('/auth/mock/login')
      .send({ email: demoUser.email, password: 'password' }).expect(201);
    expect(response.body).toEqual({ token: 'lazyfinance-demo-token' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(queries).toBe(1);
    users = [];
    await request(app.getHttpServer()).post('/auth/mock/login')
      .send({ email: demoUser.email, password: 'password' }).expect(401);
  });

  it('advertises Firebase and refuses both mock login and a demo token in Firebase mode', async () => {
    const db = {
      select: () => { throw new Error('Demo database lookup must not run'); },
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_PG_CLIENT).useValue(db)
      .overrideProvider(EnvironmentService).useValue({
        get: (key: string) => key === 'AUTH_PROVIDER' ? 'firebase'
          : key === 'FIREBASE_PROJECT_ID' ? 'lazyfinance-dev' : undefined,
      }).compile();
    const firebaseApp = module.createNestApplication();
    await firebaseApp.init();

    try {
      await request(firebaseApp.getHttpServer()).get('/auth/config')
        .expect(200, { provider: 'firebase' });
      await request(firebaseApp.getHttpServer()).post('/auth/mock/login')
        .send({ email: demoUser.email, password: 'password' }).expect(404);
      await request(firebaseApp.getHttpServer()).get('/auth/principal')
        .set('Authorization', 'Bearer lazyfinance-demo-token').expect(401);
    } finally {
      await firebaseApp.close();
    }
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
