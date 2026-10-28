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
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { RecentTransaction } from '@lazyfinance/contracts';
import { ButtonDirective } from 'primeng/button';
import { Tag } from 'primeng/tag';
import { firstValueFrom } from 'rxjs';
import { formatClp } from '../../../../utils/currency';
import { ApiService } from '../../../services/api/api.service';
import { SessionService } from '../../../services/session/session.service';
import { TransactionTagSelector, type TagSelection } from './tag-selector/tag-selector';

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago',
});

type ActivityState = { transactions: RecentTransaction[]; error: boolean };
export const ACTIVITY_STATE_KEY = makeStateKey<ActivityState | null>('dashboard-recent-activity');

@Component({
  selector: 'dashboard-activity',
  imports: [ButtonDirective, Tag, TransactionTagSelector],
  templateUrl: './activity.html',
})
export class Activity implements OnInit {
  readonly tagChanged = output<void>();
  private readonly session = inject(SessionService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private readonly pendingTasks = inject(PendingTasks);
  private readonly transferState = inject(TransferState);
  private readonly serverState = this.transferState.get(ACTIVITY_STATE_KEY, null);

  protected readonly transactions = signal<RecentTransaction[]>(this.serverState?.transactions ?? []);
  protected readonly loading = signal(this.serverState === null);
  protected readonly error = signal(this.serverState?.error ?? false);
  protected readonly needsTagCount = computed(() => this.transactions().filter((transaction) =>
    transaction.tag === null && transaction.tagDecisionOrigin === 'unreviewed').length);

  ngOnInit(): void {
    if (this.serverState) {
      this.transferState.remove(ACTIVITY_STATE_KEY);
      return;
    }
    this.pendingTasks.run(() => this.loadRecent());
  }

  protected async loadRecent(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const transactions = await firstValueFrom(this.api.getRecentTransactions());
      this.transactions.set(transactions);
      if (this.isServer) this.transferState.set(ACTIVITY_STATE_KEY, { transactions, error: false });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.session.clear();
        await this.router.navigateByUrl('/login');
        return;
      }
      this.error.set(true);
      if (this.isServer) this.transferState.set(ACTIVITY_STATE_KEY, { transactions: [], error: true });
    } finally {
      this.loading.set(false);
    }
  }

  protected formattedDate(bookedAt: string): string {
    return dateFormatter.format(new Date(bookedAt));
  }

  protected formattedAmount(amount: string): string {
    return formatClp(Number(amount));
  }

  protected onTagChanged({ transactionId, tag, origin }: TagSelection): void {
    this.transactions.update((items) => items.map((item) => item.id === transactionId
      ? { ...item, tag, tagDecisionOrigin: origin, tagRuleId: null }
      : item));
    this.tagChanged.emit();
  }
}
