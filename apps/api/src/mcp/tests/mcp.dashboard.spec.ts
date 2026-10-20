import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MCP_STRATEGY, McpStrategy } from '@rekog/mcp-nest';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AccountsService } from '../../accounts/accounts.service';
import { AppModule } from '../../app.module';
import { AuthService } from '../../auth/auth.service';
import { DRIZZLE_PG_CLIENT } from '../../drizzle/drizzle.tokens';
import { ObjectivesService } from '../../objectives/objectives.service';
import { SummariesService } from '../../summaries/summaries.service';
import { TransactionsService } from '../../transactions/transactions.service';

describe('Dashboard MCP tools', () => {
  let app: INestApplication;
  const accounts = {
    getActiveForUser: vi.fn(async (userId: string) => [
      {
        id: '00000000-0000-4000-8000-000000000011',
        alias: userId,
        type: 'checking',
        currency: 'CLP',
        balance: '25000.00',
        lastSyncedAt: null,
      },
    ]),
  };
  const transactions = { getRecentForUser: vi.fn(async () => []) };
  const objectives = {
    getForUser: vi.fn(async () => []),
    getSpendingProgressForUser: vi.fn(async () => []),
  };
  const summaries = {
    getMonthlyForUser: vi.fn(async (_userId: string, month: string) => ({
      month,
      income: '1379000.00',
      spending: '15000.00',
      tags: [],
    })),
    getComparisonForUser: vi.fn(async (_userId: string, month: string) => ({
      month,
      previousMonth: '2026-08',
      partial: false,
      income: {
        current: '1379000.00',
        previous: '1250000.00',
        change: '129000.00',
      },
      spending: {
        current: '15000.00',
        previous: '10000.00',
        change: '5000.00',
      },
    })),
  };

  function post(token: string, method: string, params?: object) {
    return request(app.getHttpServer())
      .post('/mcp')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method, ...(params && { params }) });
  }

  function call(token: string, name: string, args: object = {}) {
    return post(token, 'tools/call', { name, arguments: args });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_PG_CLIENT)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({
        authenticate: async (authorization?: string) => {
          const token = authorization?.replace('Bearer ', '');
          if (token !== 'alice' && token !== 'bob')
            throw new UnauthorizedException();
          return { userId: token, name: token, email: `${token}@example.com` };
        },
      })
      .overrideProvider(AccountsService)
      .useValue(accounts)
      .overrideProvider(TransactionsService)
      .useValue(transactions)
      .overrideProvider(ObjectivesService)
      .useValue(objectives)
      .overrideProvider(SummariesService)
      .useValue(summaries)
      .compile();

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

  it('advertises six Spanish, read-only tools with discoverable input/output schemas', async () => {
    const initialized = await post('alice', 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'mcp-dashboard-test', version: '1.0.0' },
    }).expect(200);
    expect(initialized.body.result.instructions).toContain('America/Santiago');
    expect(initialized.body.result.serverInfo.title).toContain(
      'Finanzas personales',
    );

    const response = await post('alice', 'tools/list').expect(200);
    const tools = response.body.result.tools as Array<{
      name: string;
      description: string;
      annotations: {
        title: string;
        readOnlyHint: boolean;
        destructiveHint: boolean;
      };
      inputSchema: { properties?: { month?: { description: string } } };
      outputSchema: { type: string; properties?: Record<string, unknown> };
    }>;
    expect(tools.map(({ name }) => name).sort()).toEqual([
      'comparar_gastos_mensuales',
      'consultar_avance_presupuestos',
      'consultar_movimientos_recientes',
      'consultar_presupuestos_y_metas',
      'consultar_resumen_gastos_mensuales',
      'consultar_saldos_cuentas',
    ]);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(90);
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
      });
      expect(tool.annotations.title.length).toBeGreaterThan(5);
      expect(tool.outputSchema, JSON.stringify(tool)).toBeDefined();
      expect(tool.outputSchema.type).toMatch(/object|array/);
    }
    expect(
      tools.find(({ name }) => name === 'consultar_resumen_gastos_mensuales')
        ?.inputSchema.properties?.month?.description,
    ).toContain('America/Santiago');
    expect(
      tools.find(({ name }) => name === 'consultar_saldos_cuentas')
        ?.outputSchema.type,
    ).toBe('object');
    for (const name of [
      'consultar_resumen_gastos_mensuales',
      'comparar_gastos_mensuales',
    ]) {
      const tool = tools.find((item) => item.name === name);
      expect(tool?.description.toLowerCase()).not.toContain('ingreso');
      expect(tool?.outputSchema.properties).not.toHaveProperty('income');
    }
  });

  it('scopes every tool call to the caller and returns validated structured results', async () => {
    const calls: Array<[string, string, object]> = [
      ['consultar_saldos_cuentas', 'bob', {}],
      ['consultar_movimientos_recientes', 'alice', {}],
      ['consultar_presupuestos_y_metas', 'alice', {}],
      ['consultar_avance_presupuestos', 'bob', { month: '2026-09' }],
      ['consultar_resumen_gastos_mensuales', 'alice', { month: '2026-09' }],
      ['comparar_gastos_mensuales', 'bob', { month: '2026-09' }],
    ];
    for (const [name, token, args] of calls) {
      const response = await call(token, name, args).expect(200);
      expect(response.body.result, JSON.stringify(response.body)).toBeDefined();
      expect(response.body.result.isError).not.toBe(true);
      expect(response.body.result.structuredContent).toBeDefined();
      if (name === 'consultar_saldos_cuentas') {
        expect(response.body.result.structuredContent.accounts[0].alias).toBe(
          token,
        );
      }
      if (
        name === 'consultar_resumen_gastos_mensuales' ||
        name === 'comparar_gastos_mensuales'
      ) {
        expect(response.body.result.structuredContent).not.toHaveProperty(
          'income',
        );
        expect(JSON.stringify(response.body.result)).not.toContain(
          '1379000.00',
        );
        expect(response.body.result.structuredContent.spending).toBeDefined();
      }
    }
    expect(accounts.getActiveForUser).toHaveBeenCalledWith('bob');
    expect(transactions.getRecentForUser).toHaveBeenCalledWith('alice');
    expect(objectives.getForUser).toHaveBeenCalledWith('alice');
    expect(objectives.getSpendingProgressForUser).toHaveBeenCalledWith(
      'bob',
      '2026-09',
    );
    expect(summaries.getMonthlyForUser).toHaveBeenCalledWith(
      'alice',
      '2026-09',
    );
    expect(summaries.getComparisonForUser).toHaveBeenCalledWith(
      'bob',
      '2026-09',
    );
  });

  it('defaults to the current Santiago month and rejects invalid or future months', async () => {
    const current = await call(
      'alice',
      'consultar_resumen_gastos_mensuales',
    ).expect(200);
    const month = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date());
    expect(current.body.result.structuredContent.month).toBe(month);
    const invalid = await call('alice', 'consultar_avance_presupuestos', {
      month: '2026-13',
    }).expect(200);
    expect(invalid.body.result.isError).toBe(true);
    const callsBefore = summaries.getComparisonForUser.mock.calls.length;
    const future = await call('alice', 'comparar_gastos_mensuales', {
      month: '9999-12',
    }).expect(200);
    expect(future.body.result.isError).toBe(true);
    expect(future.body.result.content[0].text).toContain('no puede ser futuro');
    expect(summaries.getComparisonForUser).toHaveBeenCalledTimes(callsBefore);
  });

  it('does not expose tool data to unauthenticated callers', async () => {
    await request(app.getHttpServer())
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      .expect(401);
  });
});
