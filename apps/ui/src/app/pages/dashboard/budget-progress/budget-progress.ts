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
import type { BudgetProgress } from '@lazyfinance/contracts';
import { firstValueFrom } from 'rxjs';
import { formatClp } from '../../../../utils/currency';
import { currentMonth, monthLabel } from '../../../../utils/month';
import { ApiService } from '../../../services/api/api.service';
import { SessionService } from '../../../services/session/session.service';

type ProgressState = { month: string; budgets: BudgetProgress[]; error: boolean };
export const PROGRESS_STATE_KEY = makeStateKey<ProgressState | null>('dashboard-budget-progress');

@Component({ selector: 'dashboard-budget-progress', templateUrl: './budget-progress.html' })
export class BudgetProgressView implements OnInit {
  private readonly session = inject(SessionService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private readonly pendingTasks = inject(PendingTasks);
  private readonly transferState = inject(TransferState);
  private readonly serverState = this.transferState.get(PROGRESS_STATE_KEY, null);

  protected readonly month = this.serverState?.month ?? currentMonth();
  protected readonly label = monthLabel(this.month);
  protected readonly budgets = signal<BudgetProgress[]>(this.serverState?.budgets ?? []);
  protected readonly loading = signal(this.serverState === null);
  protected readonly error = signal(this.serverState?.error ?? false);

  ngOnInit(): void {
    if (this.serverState) {
      this.transferState.remove(PROGRESS_STATE_KEY);
      return;
    }
    this.pendingTasks.run(() => this.loadProgress());
  }

  protected async loadProgress(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const budgets = await firstValueFrom(this.api.getSpendingProgress(this.month));
      this.budgets.set(budgets);
      if (this.isServer)
        this.transferState.set(PROGRESS_STATE_KEY, { month: this.month, budgets, error: false });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.session.clear();
        await this.router.navigateByUrl('/login');
        return;
      }
      this.error.set(true);
      if (this.isServer)
        this.transferState.set(PROGRESS_STATE_KEY, { month: this.month, budgets: [], error: true });
    } finally {
      this.loading.set(false);
    }
  }

  protected money(value: string): string {
    return formatClp(Number(value));
  }
  protected barWidth(value: number): number {
    return Math.min(value, 100);
  }
  protected periodLabel(period: BudgetProgress['period']): string {
    return period === 'monthly'
      ? 'Mes'
      : period === 'yearly'
        ? 'Año hasta hoy'
        : 'Período definido';
  }
}
