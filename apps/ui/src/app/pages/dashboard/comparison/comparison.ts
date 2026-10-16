import { isPlatformServer } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  OnInit,
  PLATFORM_ID,
  PendingTasks,
  TransferState,
  inject,
  makeStateKey,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { MonthlyComparison } from '@lazyfinance/contracts';
import { firstValueFrom } from 'rxjs';
import { formatClp } from '../../../../utils/currency';
import { lastCompletedMonth, monthLabel } from '../../../../utils/month';
import { ApiService } from '../../../services/api/api.service';
import { SessionService } from '../../../services/session/session.service';

type ComparisonState = { month: string; comparison: MonthlyComparison | null; error: boolean };
export const COMPARISON_STATE_KEY = makeStateKey<ComparisonState | null>('dashboard-comparison');

@Component({ selector: 'dashboard-comparison', templateUrl: './comparison.html' })
export class Comparison implements OnInit {
  private readonly session = inject(SessionService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private readonly pendingTasks = inject(PendingTasks);
  private readonly transferState = inject(TransferState);
  private readonly serverState = this.transferState.get(COMPARISON_STATE_KEY, null);

  protected readonly month = this.serverState?.month ?? lastCompletedMonth();
  protected readonly comparison = signal<MonthlyComparison | null>(
    this.serverState?.comparison ?? null,
  );
  protected readonly loading = signal(this.serverState === null);
  protected readonly error = signal(this.serverState?.error ?? false);

  ngOnInit(): void {
    if (this.serverState) {
      this.transferState.remove(COMPARISON_STATE_KEY);
      return;
    }
    this.pendingTasks.run(() => this.loadComparison());
  }

  protected async loadComparison(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const comparison = await firstValueFrom(this.api.getMonthlyComparison(this.month));
      this.comparison.set(comparison);
      if (this.isServer)
        this.transferState.set(COMPARISON_STATE_KEY, {
          month: this.month,
          comparison,
          error: false,
        });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.session.clear();
        await this.router.navigateByUrl('/login');
        return;
      }
      this.error.set(true);
      if (this.isServer)
        this.transferState.set(COMPARISON_STATE_KEY, {
          month: this.month,
          comparison: null,
          error: true,
        });
    } finally {
      this.loading.set(false);
    }
  }

  protected label(month: string): string {
    return monthLabel(month);
  }
  protected money(amount: string): string {
    return formatClp(Number(amount));
  }
  protected change(amount: string, noun: string): string {
    const value = Number(amount);
    if (value === 0) return `${noun} sin cambios`;
    return `${formatClp(Math.abs(value))} ${value > 0 ? 'más' : 'menos'}`;
  }
}
