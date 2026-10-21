import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { PLATFORM_ID, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { AccountSummary } from '@lazyfinance/contracts';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../../services/api/api.service';
import { SessionService } from '../../../services/session/session.service';
import { ACCOUNTS_STATE_KEY, Account } from './account';

describe('Account', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(
    getAccounts: () => ReturnType<ApiService['getAccounts']>,
    platform = 'browser',
    transferred: { accounts: AccountSummary[]; error: boolean } | null = null,
  ) {
    const clear = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: SessionService, useValue: { user: () => ({ name: 'Camila Rojas' }), clear } },
        { provide: ApiService, useValue: { getAccounts } },
      ],
    });
    const transferState = TestBed.inject(TransferState);
    if (transferred) transferState.set(ACCOUNTS_STATE_KEY, transferred);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Account);
    fixture.detectChanges();
    return { fixture, clear, navigate, transferState };
  }

  it('shows account balances from the API without adding credit card debt to cash', async () => {
    const getAccounts = vi.fn(() =>
      of([
        {
          id: '00000000-0000-4000-8000-000000000002',
          alias: 'Cuenta corriente',
          type: 'checking' as const,
          currency: 'CLP' as const,
          balance: '125000.00',
          lastSyncedAt: null,
        },
        {
          id: '00000000-0000-4000-8000-000000000003',
          alias: 'Tarjeta',
          type: 'credit_card' as const,
          currency: 'CLP' as const,
          balance: '-49990.00',
          lastSyncedAt: '2026-10-15T15:00:00.000Z',
        },
      ]),
    );
    const { fixture } = setup(getAccounts);
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Cuenta corriente');
    expect(text).toContain('$125.000');
    expect(text).toContain('Saldo adeudado');
    expect(text).toContain('$49.990');
    expect(text).toContain('Sin información de actualización');
    expect(text).toContain('Actualizado');
    expect(getAccounts).toHaveBeenCalledOnce();
  });

  it('fetches accounts on the server and saves them for hydration', async () => {
    const getAccounts = vi.fn(() => of([]));
    const { fixture, transferState } = setup(getAccounts, 'server');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getAccounts).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('Todavía no hay cuentas');
    expect(transferState.get(ACCOUNTS_STATE_KEY, null)).toEqual({ accounts: [], error: false });
  });

  it('hydrates server-rendered accounts without requesting them again', () => {
    const accounts: AccountSummary[] = [
      {
        id: '00000000-0000-4000-8000-000000000002',
        alias: 'Cuenta corriente',
        type: 'checking',
        currency: 'CLP',
        balance: '125000.00',
        lastSyncedAt: null,
      },
    ];
    const getAccounts = vi.fn(() => of([]));
    const { fixture, transferState } = setup(getAccounts, 'browser', { accounts, error: false });

    expect(fixture.nativeElement.textContent).toContain('$125.000');
    expect(getAccounts).not.toHaveBeenCalled();
    expect(transferState.hasKey(ACCOUNTS_STATE_KEY)).toBe(false);
  });

  it('renders an error when the server cannot load accounts', async () => {
    const getAccounts = () => throwError(() => new HttpErrorResponse({ status: 503 }));
    const { fixture, transferState } = setup(getAccounts, 'server');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar tus cuentas');
    expect(transferState.get(ACCOUNTS_STATE_KEY, null)).toEqual({ accounts: [], error: true });
  });

  it('explains when no accounts are available', async () => {
    const { fixture } = setup(() => of([]));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Todavía no hay cuentas');
  });

  it('clears an expired session when the API rejects the request', async () => {
    const getAccounts = () => throwError(() => new HttpErrorResponse({ status: 401 }));
    const { fixture, clear, navigate } = setup(getAccounts);
    await fixture.whenStable();

    expect(clear).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('offers a retry after a request fails', async () => {
    const getAccounts = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })))
      .mockReturnValueOnce(of([]));
    const { fixture } = setup(getAccounts);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar tus cuentas');

    (
      fixture.nativeElement.querySelector('[data-testid="retry-accounts"]') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Todavía no hay cuentas');
    expect(getAccounts).toHaveBeenCalledTimes(2);
  });
});
