import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { PLATFORM_ID, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { ObjectiveSummary } from '@lazyfinance/contracts';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../../services/api/api.service';
import { SessionService } from '../../../services/session/session.service';
import { OBJECTIVE_STATE_KEY, Objective } from './objective';

const objectives: ObjectiveSummary[] = [
  {
    id: '00000000-0000-4000-8000-000000000041',
    name: 'Supermercado',
    amount: '280000.00',
    kind: 'time_based',
    intent: 'spending',
    isRecurring: true,
    period: 'monthly',
    startDate: '2024-01-01T15:00:00.000Z',
    endDate: null,
    tags: [{ id: '00000000-0000-4000-8000-000000000031', name: 'Compras', color: null }],
  },
  {
    id: '00000000-0000-4000-8000-000000000042',
    name: 'Fondo de emergencia',
    amount: '6500000.00',
    kind: 'amount_based',
    intent: 'saving',
    isRecurring: null,
    period: null,
    startDate: null,
    endDate: null,
    tags: [],
  },
];

describe('Objective', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(
    getObjectives: () => ReturnType<ApiService['getObjectives']>,
    platform = 'browser',
    transferred: { objectives: ObjectiveSummary[]; error: boolean } | null = null,
  ) {
    const clear = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: SessionService, useValue: { clear } },
        { provide: ApiService, useValue: { getObjectives } },
      ],
    });
    const transferState = TestBed.inject(TransferState);
    if (transferred) transferState.set(OBJECTIVE_STATE_KEY, transferred);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Objective);
    fixture.detectChanges();
    return { fixture, clear, navigate, transferState };
  }

  it('lists budget limits and savings targets with period and tags', async () => {
    const { fixture } = setup(() => of(objectives));
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Presupuestos de gasto');
    expect(text).toContain('Supermercado');
    expect(text).toContain('Mensual');
    expect(text).toContain('$280.000');
    expect(text).toContain('Compras');
    expect(text).toContain('Metas de ahorro');
    expect(text).toContain('Fondo de emergencia');
    expect(text).toContain('Sin fecha límite');
    expect(text).toContain('$6.500.000');
    expect(text).not.toContain('%');
  });

  it('renders objectives on the server and hydrates without a second request', async () => {
    const fetch = vi.fn(() => of(objectives));
    const server = setup(fetch, 'server');
    await server.fixture.whenStable();
    server.fixture.detectChanges();
    expect(server.fixture.nativeElement.textContent).toContain('Supermercado');
    expect(server.transferState.get(OBJECTIVE_STATE_KEY, null)).toEqual({
      objectives,
      error: false,
    });
    TestBed.resetTestingModule();

    const clientFetch = vi.fn(() => of([]));
    const browser = setup(clientFetch, 'browser', { objectives, error: false });
    expect(browser.fixture.nativeElement.textContent).toContain('Supermercado');
    expect(clientFetch).not.toHaveBeenCalled();
    expect(browser.transferState.hasKey(OBJECTIVE_STATE_KEY)).toBe(false);
  });

  it('shows empty/error states and retries failed requests', async () => {
    const fetch = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })))
      .mockReturnValueOnce(of([]));
    const { fixture } = setup(fetch);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar tus objetivos');

    (
      fixture.nativeElement.querySelector('[data-testid="retry-objectives"]') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aún no hay presupuestos ni metas');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('clears an expired session', async () => {
    const { fixture, clear, navigate } = setup(() =>
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );
    await fixture.whenStable();
    expect(clear).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
