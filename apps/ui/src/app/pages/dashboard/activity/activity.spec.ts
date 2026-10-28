import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { PLATFORM_ID, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import type { RecentTransaction } from '@lazyfinance/contracts';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../../services/api/api.service';
import { SessionService } from '../../../services/session/session.service';
import { ACTIVITY_STATE_KEY, Activity } from './activity';
import { TransactionTagSelector } from './tag-selector/tag-selector';

const recent: RecentTransaction[] = [
  {
    id: '00000000-0000-4000-8000-000000000011',
    bookedAt: '2026-10-15T15:00:00.000Z', amount: '-6990.00', type: 'debit',
    merchant: 'Netflix', description: null,
    account: { id: '00000000-0000-4000-8000-000000000021', alias: 'Tarjeta', type: 'credit_card', currency: 'CLP' },
    tag: { id: '00000000-0000-4000-8000-000000000031', name: 'Suscripciones', color: '#7C3AED' },
    tagDecisionOrigin: 'manual', tagRuleId: null, reviewStatus: 'clear',
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    bookedAt: '2026-10-14T15:00:00.000Z', amount: '140000.00', type: 'credit',
    merchant: null, description: 'Ahorro',
    account: { id: '00000000-0000-4000-8000-000000000022', alias: 'Fondo', type: 'savings', currency: 'CLP' },
    tag: null, tagDecisionOrigin: 'unreviewed', tagRuleId: null, reviewStatus: 'clear',
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
        { provide: ApiService, useValue: { getRecentTransactions, getTagSuggestions: () => of([]) } },
      ],
    });
    const transferState = TestBed.inject(TransferState);
    if (transferred) transferState.set(ACTIVITY_STATE_KEY, transferred);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Activity);
    fixture.detectChanges();
    return { fixture, clear, navigate, transferState };
  }

  it('shows scoped recent movements and delegates tag controls to the selector', async () => {
    const getRecentTransactions = vi.fn(() => of(recent));
    const { fixture } = setup(getRecentTransactions);
    await fixture.whenStable();
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('li') as NodeListOf<HTMLLIElement>;
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Netflix');
    expect(items[0].textContent).toContain('15 de octubre de 2026');
    expect(items[0].textContent).toContain('Suscripciones');
    expect(items[0].textContent).toContain('-$6.990');
    expect(items[1].textContent).toContain('Ahorro');
    expect(items[1].textContent).toContain('$140.000');
    expect(items[1].textContent).toContain('+ Etiquetar');
    expect(fixture.debugElement.queryAll(By.directive(TransactionTagSelector))).toHaveLength(2);
    expect(getRecentTransactions).toHaveBeenCalledOnce();
  });

  it('updates the movement and notifies the dashboard after a selector decision', async () => {
    const { fixture } = setup(() => of(recent));
    const changed = vi.fn();
    fixture.componentInstance.tagChanged.subscribe(changed);
    await fixture.whenStable();
    fixture.detectChanges();
    const selector = fixture.debugElement.queryAll(By.directive(TransactionTagSelector))[1]
      .componentInstance as TransactionTagSelector;
    selector.tagChanged.emit({ transactionId: recent[1].id, tag: null, origin: 'manual' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin etiqueta · tu decisión');
    expect(changed).toHaveBeenCalledOnce();
  });

  it('loads on the server and hydrates without a second request', async () => {
    const getRecentTransactions = vi.fn(() => of(recent));
    const server = setup(getRecentTransactions, 'server');
    await server.fixture.whenStable();
    server.fixture.detectChanges();
    expect(server.fixture.nativeElement.textContent).toContain('Netflix');
    expect(server.transferState.get(ACTIVITY_STATE_KEY, null)).toEqual({ transactions: recent, error: false });
    TestBed.resetTestingModule();

    const browserGet = vi.fn(() => of([]));
    const browser = setup(browserGet, 'browser', { transactions: recent, error: false });
    expect(browser.fixture.nativeElement.textContent).toContain('Netflix');
    expect(browserGet).not.toHaveBeenCalled();
    expect(browser.transferState.hasKey(ACTIVITY_STATE_KEY)).toBe(false);
  });

  it('explains when there is no activity', async () => {
    const { fixture } = setup(() => of([]));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Todavía no hay movimientos');
  });

  it('clears an expired session', async () => {
    const { fixture, clear, navigate } = setup(() =>
      throwError(() => new HttpErrorResponse({ status: 401 })));
    await fixture.whenStable();
    expect(clear).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('offers retry after an API error', async () => {
    const getRecentTransactions = vi.fn()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })))
      .mockReturnValueOnce(of(recent));
    const { fixture } = setup(getRecentTransactions);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar tus movimientos');
    (fixture.nativeElement.querySelector('[data-testid="retry-activity"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Netflix');
    expect(getRecentTransactions).toHaveBeenCalledTimes(2);
  });
});
