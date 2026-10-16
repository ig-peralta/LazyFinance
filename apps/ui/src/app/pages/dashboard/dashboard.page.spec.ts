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
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { user: () => ({ name: 'Camila Rojas' }), clear } },
        { provide: ApiService, useValue: { getAccounts, getRecentTransactions, getObjectives } },
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
    expect(getAccounts).toHaveBeenCalledOnce();
    expect(getRecentTransactions).toHaveBeenCalledOnce();
    expect(getObjectives).toHaveBeenCalledOnce();

    (fixture.nativeElement.querySelector('header button') as HTMLButtonElement).click();
    expect(clear).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
