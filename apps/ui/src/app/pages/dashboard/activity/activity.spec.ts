import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { PLATFORM_ID, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { RecentTransaction } from '@lazyfinance/contracts';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../../services/api/api.service';
import { SessionService } from '../../../services/session/session.service';
import { ACTIVITY_STATE_KEY, Activity } from './activity';

const recent: RecentTransaction[] = [
  {
    id: '00000000-0000-4000-8000-000000000011',
    bookedAt: '2026-10-15T15:00:00.000Z',
    amount: '-6990.00',
    type: 'debit',
    merchant: 'Netflix',
    description: null,
    account: {
      id: '00000000-0000-4000-8000-000000000021',
      alias: 'Tarjeta',
      type: 'credit_card',
      currency: 'CLP',
    },
    tag: { id: '00000000-0000-4000-8000-000000000031', name: 'Suscripciones', color: '#7C3AED' },
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    bookedAt: '2026-10-14T15:00:00.000Z',
    amount: '140000.00',
    type: 'credit',
    merchant: null,
    description: 'Ahorro',
    account: {
      id: '00000000-0000-4000-8000-000000000022',
      alias: 'Fondo',
      type: 'savings',
      currency: 'CLP',
    },
    tag: null,
  },
];

describe('Activity', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(
    getRecentTransactions: () => ReturnType<ApiService['getRecentTransactions']>,
    platform = 'browser',
    transferred: { transactions: RecentTransaction[]; error: boolean } | null = null,
  ) {
    const clear = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: SessionService, useValue: { clear } },
        { provide: ApiService, useValue: { getRecentTransactions } },
      ],
    });
    const transferState = TestBed.inject(TransferState);
    if (transferred) transferState.set(ACTIVITY_STATE_KEY, transferred);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Activity);
    fixture.detectChanges();
    return { fixture, clear, navigate, transferState };
  }

  it('shows each movement’s single tag or its unclassified state', async () => {
    const getRecentTransactions = vi.fn(() => of(recent));
    const { fixture } = setup(getRecentTransactions);
    await fixture.whenStable();
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('li') as NodeListOf<HTMLLIElement>;
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Netflix');
    expect(items[0].textContent).toContain('Tarjeta');
    expect(items[0].textContent).toContain('15 de octubre de 2026');
    expect(items[0].textContent).toContain('Suscripciones');
    expect(items[0].textContent).toContain('-$6.990');
    expect(items[1].textContent).toContain('Ahorro');
    expect(items[1].textContent).toContain('$140.000');
    expect(items[1].textContent).toContain('Sin etiqueta');
    expect(getRecentTransactions).toHaveBeenCalledOnce();
  });

  it('loads on the server and transfers the response to the browser', async () => {
    const getRecentTransactions = vi.fn(() => of(recent));
    const { fixture, transferState } = setup(getRecentTransactions, 'server');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Netflix');
    expect(transferState.get(ACTIVITY_STATE_KEY, null)).toEqual({
      transactions: recent,
      error: false,
    });
  });

  it('hydrates the server result without a second request', () => {
    const getRecentTransactions = vi.fn(() => of([]));
    const { fixture, transferState } = setup(getRecentTransactions, 'browser', {
      transactions: recent,
      error: false,
    });

    expect(fixture.nativeElement.textContent).toContain('Netflix');
    expect(getRecentTransactions).not.toHaveBeenCalled();
    expect(transferState.hasKey(ACTIVITY_STATE_KEY)).toBe(false);
  });

  it('explains when no movements are available', async () => {
    const { fixture } = setup(() => of([]));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Todavía no hay movimientos');
  });

  it('clears an expired session when the API rejects the request', async () => {
    const { fixture, clear, navigate } = setup(() =>
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );
    await fixture.whenStable();

    expect(clear).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('offers a retry after an API error', async () => {
    const getRecentTransactions = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })))
      .mockReturnValueOnce(of(recent));
    const { fixture } = setup(getRecentTransactions);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar tus movimientos');

    (
      fixture.nativeElement.querySelector('[data-testid="retry-activity"]') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Netflix');
    expect(getRecentTransactions).toHaveBeenCalledTimes(2);
  });
});
