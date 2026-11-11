import {
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
  untracked,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { MonthSchema } from "@lazyfinance/contracts";
import { formatClp } from "../../../utils/currency";
import { currentMonth, monthLabel } from "../../../utils/month";
import { reportWorkspaceReadiness } from "../../core/rendering/workspace-preparation";
import { RpcClient } from "../../core/rpc/rpc-client";
import { AssistantWorkspace } from "../../features/assistant/assistant-workspace";

/** Deep links select history; ordinary navigation restores the existing session. */
@Component({
  selector: "assistant-entry",
  imports: [RouterLink],
  template: `
    <header class="page-header assistant-home-heading">
      <div><p class="eyebrow">TU ESPACIO FINANCIERO</p><h1>Más claridad, menos vueltas<span class="accent-text">.</span></h1></div>
      <div class="page-actions"><label class="button month-picker"><span class="sr-only">Mes del resumen</span><input #picker type="month" [value]="month()" [max]="maxMonth" (change)="selectMonth(picker.value)" /></label><a class="text-link" routerLink="/dashboard">Resumen completo ↗</a></div>
    </header>
    @if (summary.hasValue()) {
      @let data = summary.value();
      <section class="financial-snapshot" [attr.aria-label]="'Las cifras de ' + period()">
        <a routerLink="/movimientos"><span>Gasto neto</span><strong>{{ money(data.spending) }}</strong><small>Compras menos recuperaciones confirmadas</small></a>
        <a routerLink="/ingresos" [queryParams]="{ month: month() }"><span>Ingresos recibidos</span><strong>{{ money(data.receivedIncome) }}</strong><small>Confirmados al corte · no es tu saldo</small></a>
        <a routerLink="/ingresos/fuentes"><span>Ingresos esperados</span><strong>{{ money(data.expectedIncome.amount) }}</strong><small>Plan del mes · no es dinero disponible @if (data.expectedIncome.estimatedAmount !== '0.00') { · Incluye estimaciones } @if (data.expectedIncome.unknownAmountCount) { · Importes por definir }</small></a>
      </section>
      @if (data.unresolvedMovementCount || data.unresolvedAdjustmentCount) { <p class="field-hint">Hay movimientos o ajustes por revisar. Los importes pendientes no reducen el gasto.</p> }
    } @else if (summary.error()) {
      <p class="notice warning" role="status">No pudimos cargar las cifras. <button class="text-link" type="button" (click)="summary.reload()">Reintentar resumen</button> · Puedes usar las secciones financieras sin IA.</p>
    } @else { <div class="financial-snapshot" role="status" aria-label="Cargando cifras del mes">@for (item of [1,2,3]; track item) { <div class="skeleton big"></div> }</div> }
  `,
})
export class AssistantEntry {
  protected readonly workspace = inject(AssistantWorkspace);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);
  private readonly rpc = inject(RpcClient);
  protected readonly maxMonth = currentMonth();
  protected readonly month = signal(this.maxMonth);
  protected readonly period = computed(() => monthLabel(this.month()));
  protected readonly money = formatClp;
  protected readonly summary = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope();
      return scope && { scope, month: this.month() };
    },
    loader: ({ params, abortSignal }) =>
      params.scope.client.summaries.monthly.query(
        { month: params.month },
        { signal: abortSignal },
      ),
  });

  constructor() {
    reportWorkspaceReadiness(this.summary);
    effect(() => {
      const query = this.query();
      if (!query) return;
      untracked(() => {
        if (query.has("conversacion"))
          this.workspace.selection.set(query.get("conversacion") ?? undefined);
        this.workspace.open();
      });
    });
  }

  protected selectMonth(month: string) {
    if (MonthSchema.safeParse(month).success && month <= this.maxMonth)
      this.month.set(month);
  }
}
