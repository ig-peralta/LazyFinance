import '@angular/compiler';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { apiInterceptor } from '../../interceptors/api.interceptor';
import { SessionService } from '../session/session.service';
import { API_URL } from '../../tokens/api-url';
import { ApiService } from './api.service';

describe('ApiService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('requests the principal with the supplied bearer token', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const api = TestBed.inject(ApiService);
    const backend = TestBed.inject(HttpTestingController);

    const result = firstValueFrom(api.getPrincipal('demo-token'));
    const request = backend.expectOne(`${environment.apiUrl}/auth/principal`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer demo-token');

    const principal = {
      userId: 'demo-user',
      email: 'demo@lazyfinance.local',
      name: 'Camila Rojas',
    };
    request.flush(principal);
    await expect(result).resolves.toEqual(principal);
    backend.verify();
  });

  it('requests account summaries from the API', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const api = TestBed.inject(ApiService);
    const backend = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(api.getAccounts());

    const request = backend.expectOne(`${environment.apiUrl}/accounts`);
    expect(request.request.method).toBe('GET');
    request.flush([
      {
        id: '00000000-0000-4000-8000-000000000002',
        alias: 'Cuenta corriente',
        type: 'checking',
        currency: 'CLP',
        balance: '125000.00',
      },
    ]);

    await expect(result).resolves.toMatchObject([{ balance: '125000.00' }]);
    backend.verify();
  });

  it('requests recent transactions from the API', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const result = firstValueFrom(TestBed.inject(ApiService).getRecentTransactions());
    const backend = TestBed.inject(HttpTestingController);
    const request = backend.expectOne(`${environment.apiUrl}/transactions/recent`);

    expect(request.request.method).toBe('GET');
    request.flush([]);
    await expect(result).resolves.toEqual([]);
    backend.verify();
  });

  it('requests the user objectives', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const result = firstValueFrom(TestBed.inject(ApiService).getObjectives());
    const backend = TestBed.inject(HttpTestingController);
    const request = backend.expectOne(`${environment.apiUrl}/objectives`);
    expect(request.request.method).toBe('GET');
    request.flush([]);
    await expect(result).resolves.toEqual([]);
    backend.verify();
  });

  it('requests the monthly summary for a selected period', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const result = firstValueFrom(TestBed.inject(ApiService).getMonthlySummary('2026-09'));
    const backend = TestBed.inject(HttpTestingController);
    const request = backend.expectOne(`${environment.apiUrl}/summaries/monthly?month=2026-09`);
    expect(request.request.method).toBe('GET');
    request.flush({ month: '2026-09', income: '0', spending: '0', tags: [] });
    await expect(result).resolves.toMatchObject({ month: '2026-09' });
    backend.verify();
  });

  it('requests monthly comparisons and spending-budget progress', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const api = TestBed.inject(ApiService);
    const backend = TestBed.inject(HttpTestingController);
    const comparison = firstValueFrom(api.getMonthlyComparison('2026-09'));
    const progress = firstValueFrom(api.getSpendingProgress('2026-09'));
    const comparisonRequest = backend.expectOne(
      `${environment.apiUrl}/summaries/comparison?month=2026-09`,
    );
    const progressRequest = backend.expectOne(
      `${environment.apiUrl}/objectives/spending-progress?month=2026-09`,
    );
    comparisonRequest.flush({
      month: '2026-09',
      previousMonth: '2026-08',
      partial: false,
      income: {},
      spending: {},
    });
    progressRequest.flush([]);
    await expect(comparison).resolves.toMatchObject({ previousMonth: '2026-08' });
    await expect(progress).resolves.toEqual([]);
    backend.verify();
  });

  it('uses the configured server API URL and still attaches the session token', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: 'http://api:3000' },
        { provide: SessionService, useValue: { token: () => 'demo-token' } },
      ],
    });
    const result = firstValueFrom(TestBed.inject(ApiService).getAccounts());
    const backend = TestBed.inject(HttpTestingController);
    const request = backend.expectOne('http://api:3000/accounts');

    expect(request.request.headers.get('Authorization')).toBe('Bearer demo-token');
    request.flush([]);
    await expect(result).resolves.toEqual([]);
    backend.verify();
  });
});
