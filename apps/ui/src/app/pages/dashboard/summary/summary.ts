import { isPlatformServer } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  OnInit,
  PLATFORM_ID,
  PendingTasks,
  TransferState,
  computed,
  inject,
  makeStateKey,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { MonthlySummary } from '@lazyfinance/contracts';
import { firstValueFrom } from 'rxjs';
import { formatClp } from '../../../../utils/currency';
import { currentMonth, monthLabel } from '../../../../utils/month';
import { ApiService } from '../../../services/api/api.service';
import { SessionService } from '../../../services/session/session.service';

type SummaryState = { month: string; summary: MonthlySummary | null; error: boolean };
export const SUMMARY_STATE_KEY = makeStateKey<SummaryState | null>('dashboard-monthly-summary');

@Component({ selector: 'dashboard-summary', templateUrl: './summary.html' })
export class Summary implements OnInit {
  private readonly session = inject(SessionService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private readonly pendingTasks = inject(PendingTasks);
  private readonly transferState = inject(TransferState);
  private readonly serverState = this.transferState.get(SUMMARY_STATE_KEY, null);

  protected readonly month = this.serverState?.month ?? currentMonth();
  protected readonly period = monthLabel(this.month);
  protected readonly summary = signal<MonthlySummary | null>(this.serverState?.summary ?? null);
  protected readonly tagBars = computed(() => {
    const tags = [...(this.summary()?.tags ?? [])].sort(
      (left, right) =>
        Number(right.amount) - Number(left.amount) || left.name.localeCompare(right.name),
    );
    const maximum = Number(tags[0]?.amount ?? 0);
    return tags.map((tag) => ({
      ...tag,
      width:
        maximum > 0 && Number.isFinite(Number(tag.amount))
          ? Math.max(0, Math.min(100, (Number(tag.amount) / maximum) * 100))
          : 0,
    }));
  });
  protected readonly loading = signal(this.serverState === null);
  protected readonly error = signal(this.serverState?.error ?? false);

  ngOnInit(): void {
    if (this.serverState) {
      this.transferState.remove(SUMMARY_STATE_KEY);
      return;
    }
    this.pendingTasks.run(() => this.loadSummary());
  }

  protected async loadSummary(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const summary = await firstValueFrom(this.api.getMonthlySummary(this.month));
      this.summary.set(summary);
      if (this.isServer)
        this.transferState.set(SUMMARY_STATE_KEY, { month: this.month, summary, error: false });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.session.clear();
        await this.router.navigateByUrl('/login');
        return;
      }
      this.error.set(true);
      if (this.isServer)
        this.transferState.set(SUMMARY_STATE_KEY, {
          month: this.month,
          summary: null,
          error: true,
        });
    } finally {
      this.loading.set(false);
    }
  }

  protected money(value: string): string {
    return formatClp(Number(value));
  }
}
