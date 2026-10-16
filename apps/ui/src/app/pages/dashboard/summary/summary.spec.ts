import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { PLATFORM_ID, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { MonthlySummary } from '@lazyfinance/contracts';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../../services/api/api.service';
import { SessionService } from '../../../services/session/session.service';
import { SUMMARY_STATE_KEY, Summary } from './summary';

const summary: MonthlySummary = {
  month: '2026-09',
  income: '1550000.00',
  spending: '10000.00',
  tags: [
    {
      id: '00000000-0000-4000-8000-000000000031',
      name: 'Comida',
      color: null,
      amount: '5000.00',
      count: 1,
    },
    {
      id: '00000000-0000-4000-8000-000000000032',
      name: 'Ocio',
      color: null,
      amount: '10000.00',
      count: 1,
    },
  ],
};

describe('Summary', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(
    getMonthlySummary: () => ReturnType<ApiService['getMonthlySummary']>,
    platform = 'browser',
    transferred: { month: string; summary: MonthlySummary | null; error: boolean } | null = null,
  ) {
    const clear = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: SessionService, useValue: { clear } },
        { provide: ApiService, useValue: { getMonthlySummary } },
      ],
    });
    const transferState = TestBed.inject(TransferState);
    if (transferred) transferState.set(SUMMARY_STATE_KEY, transferred);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Summary);
    fixture.detectChanges();
    return { fixture, clear, navigate, transferState };
  }

  it('shows independent income/spending totals and potentially overlapping tag totals', async () => {
    const getMonthlySummary = vi.fn(() => of(summary));
    const { fixture } = setup(getMonthlySummary);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Ingresos');
    expect(text).toContain('$1.550.000');
    expect(text).toContain('$10.000');
    expect(text).toContain('Comida');
    expect(text).toContain('Ocio');
    expect(text).toContain('$5.000');
    expect(text).toContain('pueden superponerse');
    const items = fixture.nativeElement.querySelectorAll('figure ol li') as NodeListOf<HTMLElement>;
    const bars = fixture.nativeElement.querySelectorAll(
      '[data-testid="tag-bar"]',
    ) as NodeListOf<HTMLElement>;
    expect(items[0].textContent).toContain('Ocio');
    expect(items[1].textContent).toContain('Comida');
    expect(bars[0].style.width).toBe('100%');
    expect(bars[1].style.width).toBe('50%');
    expect(getMonthlySummary).toHaveBeenCalledOnce();
  });

  it('renders on the server and hydrates without refetching', async () => {
    const server = setup(() => of(summary), 'server');
    await server.fixture.whenStable();
    server.fixture.detectChanges();
    expect(server.fixture.nativeElement.textContent).toContain('$1.550.000');
    expect(server.transferState.get(SUMMARY_STATE_KEY, null)?.summary).toEqual(summary);
    TestBed.resetTestingModule();

    const getMonthlySummary = vi.fn(() => of(summary));
    const browser = setup(getMonthlySummary, 'browser', {
      month: '2026-09',
      summary,
      error: false,
    });
    expect(browser.fixture.nativeElement.textContent).toContain('septiembre de 2026');
    expect(getMonthlySummary).not.toHaveBeenCalled();
    expect(browser.transferState.hasKey(SUMMARY_STATE_KEY)).toBe(false);
  });

  it('shows an empty tag state and retries errors', async () => {
    const getMonthlySummary = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })))
      .mockReturnValueOnce(of({ ...summary, tags: [] }));
    const { fixture } = setup(getMonthlySummary);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar el resumen');
    (
      fixture.nativeElement.querySelector('[data-testid="retry-summary"]') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin gastos etiquetados');
  });

  it('clears an invalid session', async () => {
    const { fixture, clear, navigate } = setup(() =>
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );
    await fixture.whenStable();
    expect(clear).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
