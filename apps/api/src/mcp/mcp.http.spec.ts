import { INestApplication } from '@nestjs/common';
import { MCP_STRATEGY, McpStrategy } from '@rekog/mcp-nest';
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { DRIZZLE_PG_CLIENT } from '../drizzle/drizzle.tokens';
import { ExternalIdentityRepository } from '../drizzle/repositories/external-identity.repository';
import { mockIdentity } from '../auth/mock/mock-auth.constants';

const demoToken = 'lazyfinance-demo-token';
const initialization = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'auth-test', version: '1.0.0' },
  },
};

describe('MCP HTTP authentication', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_PG_CLIENT).useValue({})
      .overrideProvider(ExternalIdentityRepository).useValue({
        resolveExisting: async (identity: typeof mockIdentity) => {
          if (identity.providerSubject !== mockIdentity.providerSubject) throw new UnauthorizedException();
          return { userId: '00000000-0000-4000-8000-000000000001', email: 'demo@lazyfinance.cl', name: 'Camila Rojas' };
        },
      }).compile();

    app = module.createNestApplication();
    const strategy = app.get<McpStrategy>(MCP_STRATEGY);
    strategy.setHttpAdapter(app.getHttpAdapter());
    app.connectMicroservice({ strategy });
    await app.startAllMicroservices();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests on every MCP HTTP verb', async () => {
    await request(app.getHttpServer()).post('/mcp').send(initialization).expect(401);
    await request(app.getHttpServer()).get('/mcp').expect(401);
    await request(app.getHttpServer()).delete('/mcp').expect(401);
  });

  it('rejects an unknown bearer token', async () => {
    await request(app.getHttpServer())
      .post('/mcp')
      .set('Authorization', 'Bearer unknown-token')
      .send(initialization)
      .expect(401);
  });

  it('passes an authenticated request through to the MCP transport', async () => {
    const response = await request(app.getHttpServer())
      .post('/mcp')
      .set('Authorization', `Bearer ${demoToken}`)
      .set('Accept', 'application/json, text/event-stream')
      .send(initialization)
      .expect(200);

    expect(response.body).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { serverInfo: { name: 'lazyfinance' } },
    });
  });
});
