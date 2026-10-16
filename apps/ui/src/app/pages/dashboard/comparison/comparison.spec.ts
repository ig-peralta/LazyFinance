import '@angular/compiler';
import { PLATFORM_ID, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MonthlyComparison } from '@lazyfinance/contracts';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../../services/api/api.service';
import { SessionService } from '../../../services/session/session.service';
import { COMPARISON_STATE_KEY, Comparison } from './comparison';

const comparison: MonthlyComparison = {
  month: '2026-09',
  previousMonth: '2026-08',
  income: { current: '1550000.00', previous: '1450000.00', change: '100000.00' },
  spending: { current: '500000.00', previous: '600000.00', change: '-100000.00' },
};

describe('Comparison', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(
    getMonthlyComparison: () => ReturnType<ApiService['getMonthlyComparison']>,
    platform = 'browser',
    transferred = false,
  ) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: SessionService, useValue: { clear: vi.fn() } },
        { provide: ApiService, useValue: { getMonthlyComparison } },
      ],
    });
    const transferState = TestBed.inject(TransferState);
    if (transferred)
      transferState.set(COMPARISON_STATE_KEY, { month: '2026-09', comparison, error: false });
    const fixture = TestBed.createComponent(Comparison);
    fixture.detectChanges();
    return { fixture, transferState };
  }

  it('shows the change from the previous complete month without percentage division', async () => {
    const { fixture } = setup(() => of(comparison));
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('septiembre de 2026');
    expect(text).toContain('agosto de 2026');
    expect(text).toContain('$100.000 menos');
    expect(text).toContain('$100.000 más');
  });

  it('uses transferred SSR data without refetching', () => {
    const getMonthlyComparison = vi.fn(() => of(comparison));
    const { fixture, transferState } = setup(getMonthlyComparison, 'browser', true);
    expect(fixture.nativeElement.textContent).toContain('$100.000 menos');
    expect(getMonthlyComparison).not.toHaveBeenCalled();
    expect(transferState.hasKey(COMPARISON_STATE_KEY)).toBe(false);
  });
});
