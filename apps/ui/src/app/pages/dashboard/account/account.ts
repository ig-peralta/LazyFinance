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
import type { AccountSummary } from '@lazyfinance/contracts';
import { Card } from 'primeng/card';
import { firstValueFrom } from 'rxjs';
import { formatClp } from '../../../../utils/currency';
import { formatDate } from '../../../../utils/date';
import { ApiService } from '../../../services/api/api.service';
import { SessionService } from '../../../services/session/session.service';

type AccountsState = { accounts: AccountSummary[]; error: boolean };
export const ACCOUNTS_STATE_KEY = makeStateKey<AccountsState | null>('dashboard-accounts');

@Component({
  selector: 'dashboard-account',
  imports: [Card],
  templateUrl: './account.html',
})
export class Account implements OnInit {
  private readonly session = inject(SessionService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private readonly pendingTasks = inject(PendingTasks);
  private readonly transferState = inject(TransferState);
  private readonly serverState = this.transferState.get(ACCOUNTS_STATE_KEY, null);

  protected readonly accounts = signal<AccountSummary[]>(this.serverState?.accounts ?? []);
  protected readonly loading = signal(this.serverState === null);
  protected readonly error = signal(this.serverState?.error ?? false);

  ngOnInit(): void {
    if (this.serverState) {
      this.transferState.remove(ACCOUNTS_STATE_KEY);
      return;
    }

    this.pendingTasks.run(() => this.loadAccounts());
  }

  protected async loadAccounts(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);

    try {
      const accounts = await firstValueFrom(this.api.getAccounts());
      this.accounts.set(accounts);
      if (this.isServer) this.transferState.set(ACCOUNTS_STATE_KEY, { accounts, error: false });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.session.clear();
        await this.router.navigateByUrl('/login');
        return;
      }
      this.error.set(true);
      if (this.isServer) this.transferState.set(ACCOUNTS_STATE_KEY, { accounts: [], error: true });
    } finally {
      this.loading.set(false);
    }
  }

  protected accountTypeLabel(type: AccountSummary['type']): string {
    switch (type) {
      case 'checking':
        return 'Cuenta corriente';
      case 'savings':
        return 'Cuenta de ahorro';
      case 'credit_card':
        return 'Tarjeta de crédito';
    }
  }

  protected accountBalanceLabel(account: AccountSummary): string {
    if (account.type !== 'credit_card') return 'Saldo en cuenta';
    if (Number(account.balance) < 0) return 'Saldo adeudado';
    return Number(account.balance) > 0 ? 'Saldo a favor' : 'Saldo de tarjeta';
  }

  protected formatAccountBalance(account: AccountSummary): string {
    const balance = Number(account.balance);
    return formatClp(account.type === 'credit_card' && balance < 0 ? -balance : balance);
  }

  protected freshnessLabel(account: AccountSummary): string {
    if (!account.lastSyncedAt) return 'Sin información de actualización';
    return `Actualizado ${formatDate(new Date(account.lastSyncedAt))}`;
  }
}
