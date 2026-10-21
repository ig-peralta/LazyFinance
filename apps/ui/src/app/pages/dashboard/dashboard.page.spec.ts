import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../services/api/api.service';
import { SessionService } from '../../services/session/session.service';
import { DashboardPage } from './dashboard.page';

describe('DashboardPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the dashboard shell and account section and can log out', async () => {
    const clear = vi.fn();
    const getAccounts = vi.fn(() => of([]));
    const getRecentTransactions = vi.fn(() => of([]));
    const getObjectives = vi.fn(() => of([]));
    const getMonthlySummary = vi.fn(() =>
      of({
        month: '2026-09', receivedIncome: '0', spending: '0', tags: [],
        expectedIncome: { amount: '0.00', estimatedAmount: '0.00', unknownAmountCount: 0, paymentCount: 0 },
        unclassifiedCredits: { amount: '0.00', count: 0 },
      }),
    );
    const getMonthlyComparison = vi.fn(() =>
      of({
        month: '2026-09',
        previousMonth: '2026-08',
        partial: false,
        receivedIncome: { current: '0', previous: '0', change: '0.00' },
        spending: { current: '0', previous: '0', change: '0.00' },
      }),
    );
    const getSpendingProgress = vi.fn(() => of([]));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { user: () => ({ name: 'Camila Rojas' }), clear } },
        {
          provide: ApiService,
          useValue: {
            getAccounts,
            getRecentTransactions,
            getObjectives,
            getMonthlySummary,
            getMonthlyComparison,
            getSpendingProgress,
          },
        },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Hola, Camila Rojas');
    expect(fixture.nativeElement.textContent).toContain('Cuentas');
    expect(fixture.nativeElement.textContent).toContain('Tus últimos movimientos');
    expect(fixture.nativeElement.textContent).toContain('Presupuestos y metas');
    expect(fixture.nativeElement.textContent).toContain('Gastos por etiqueta');
    expect(fixture.nativeElement.textContent).toContain('Comparación de gastos');
    expect(fixture.nativeElement.textContent).not.toContain('Ingresos');
    expect(fixture.nativeElement.textContent).toContain('Avance de presupuestos');
    expect(getAccounts).toHaveBeenCalledOnce();
    expect(getRecentTransactions).toHaveBeenCalledOnce();
    expect(getObjectives).toHaveBeenCalledOnce();
    expect(getMonthlySummary).toHaveBeenCalledOnce();
    expect(getMonthlyComparison).toHaveBeenCalledOnce();
    expect(getSpendingProgress).toHaveBeenCalledOnce();
    const headings = Array.from(
      fixture.nativeElement.querySelectorAll('h2') as NodeListOf<HTMLElement>,
      (heading) => heading.textContent?.trim(),
    );
    expect(headings.at(-1)).toBe('Tus últimos movimientos');

    (fixture.nativeElement.querySelector('header button') as HTMLButtonElement).click();
    expect(clear).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
