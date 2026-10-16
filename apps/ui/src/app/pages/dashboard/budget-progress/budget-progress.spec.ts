import '@angular/compiler';
import { PLATFORM_ID, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { BudgetProgress } from '@lazyfinance/contracts';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../../services/api/api.service';
import { SessionService } from '../../../services/session/session.service';
import { PROGRESS_STATE_KEY, BudgetProgressView } from './budget-progress';

const budgets: BudgetProgress[] = [
  {
    id: '00000000-0000-4000-8000-000000000041',
    name: 'Supermercado',
    month: '2026-09',
    period: 'monthly',
    limit: '280000.00',
    spent: '300000.00',
    remaining: '-20000.00',
    percentage: 107,
  },
  {
    id: '00000000-0000-4000-8000-000000000042',
    name: 'Viaje',
    month: '2026-09',
    period: 'yearly',
    limit: '650000.00',
    spent: '350000.00',
    remaining: '300000.00',
    percentage: 53,
  },
];

describe('BudgetProgressView', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(
    getSpendingProgress: () => ReturnType<ApiService['getSpendingProgress']>,
    platform = 'browser',
    transferred = false,
  ) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: SessionService, useValue: { clear: vi.fn() } },
        { provide: ApiService, useValue: { getSpendingProgress } },
      ],
    });
    const transferState = TestBed.inject(TransferState);
    if (transferred)
      transferState.set(PROGRESS_STATE_KEY, { month: '2026-09', budgets, error: false });
    const fixture = TestBed.createComponent(BudgetProgressView);
    fixture.detectChanges();
    return { fixture, transferState };
  }

  it('shows overspending without hiding percentages above 100', async () => {
    const { fixture } = setup(() => of(budgets));
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Supermercado');
    expect(text).toContain('107%');
    expect(text).toContain('Excedido por $20.000');
    expect(text).toContain('Viaje');
    expect(text).toContain('Disponible $300.000');
    const bars = fixture.nativeElement.querySelectorAll('[role="progressbar"]');
    expect(bars[0].getAttribute('aria-valuenow')).toBe('100');
    expect(bars[1].getAttribute('aria-valuenow')).toBe('53');
  });

  it('hydrates without another request', () => {
    const getSpendingProgress = vi.fn(() => of([]));
    const { fixture, transferState } = setup(getSpendingProgress, 'browser', true);
    expect(fixture.nativeElement.textContent).toContain('Supermercado');
    expect(getSpendingProgress).not.toHaveBeenCalled();
    expect(transferState.hasKey(PROGRESS_STATE_KEY)).toBe(false);
  });
});
