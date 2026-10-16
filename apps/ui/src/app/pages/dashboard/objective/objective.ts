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
import type { ObjectiveSummary } from '@lazyfinance/contracts';
import { firstValueFrom } from 'rxjs';
import { formatClp } from '../../../../utils/currency';
import { ApiService } from '../../../services/api/api.service';
import { SessionService } from '../../../services/session/session.service';

type ObjectiveState = { objectives: ObjectiveSummary[]; error: boolean };
export const OBJECTIVE_STATE_KEY = makeStateKey<ObjectiveState | null>('dashboard-objectives');

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Santiago',
});

@Component({
  selector: 'dashboard-objective',
  templateUrl: './objective.html',
})
export class Objective implements OnInit {
  private readonly session = inject(SessionService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private readonly pendingTasks = inject(PendingTasks);
  private readonly transferState = inject(TransferState);
  private readonly serverState = this.transferState.get(OBJECTIVE_STATE_KEY, null);

  protected readonly objectives = signal<ObjectiveSummary[]>(this.serverState?.objectives ?? []);
  protected readonly budgets = computed(() =>
    this.objectives().filter((item) => item.intent === 'spending'),
  );
  protected readonly goals = computed(() =>
    this.objectives().filter((item) => item.intent === 'saving'),
  );
  protected readonly loading = signal(this.serverState === null);
  protected readonly error = signal(this.serverState?.error ?? false);

  ngOnInit(): void {
    if (this.serverState) {
      this.transferState.remove(OBJECTIVE_STATE_KEY);
      return;
    }
    this.pendingTasks.run(() => this.loadObjectives());
  }

  protected async loadObjectives(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const objectives = await firstValueFrom(this.api.getObjectives());
      this.objectives.set(objectives);
      if (this.isServer) this.transferState.set(OBJECTIVE_STATE_KEY, { objectives, error: false });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.session.clear();
        await this.router.navigateByUrl('/login');
        return;
      }
      this.error.set(true);
      if (this.isServer)
        this.transferState.set(OBJECTIVE_STATE_KEY, { objectives: [], error: true });
    } finally {
      this.loading.set(false);
    }
  }

  protected target(amount: string): string {
    return formatClp(Number(amount));
  }

  protected periodLabel(item: ObjectiveSummary): string {
    if (item.kind === 'amount_based') return 'Sin fecha límite';
    if (item.isRecurring) {
      switch (item.period) {
        case 'daily':
          return 'Diario';
        case 'weekly':
          return 'Semanal';
        case 'monthly':
          return 'Mensual';
        case 'yearly':
          return 'Anual';
      }
    }
    if (item.startDate && item.endDate) {
      return `Inicio: ${dateFormatter.format(new Date(item.startDate))} · Fin: ${dateFormatter.format(new Date(item.endDate))}`;
    }
    return 'Período único';
  }
}
