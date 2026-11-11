import {
  Component,
  computed,
  ElementRef,
  effect,
  inject,
  resource,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { MonthSchema } from "@lazyfinance/contracts";
import { formatClp } from "../../../utils/currency";
import { currentMonth, monthLabel } from "../../../utils/month";
import { reportWorkspaceReadiness } from "../../core/rendering/workspace-preparation";
import { RpcClient } from "../../core/rpc/rpc-client";
import { AssistantWorkspace } from "../../features/assistant/assistant-workspace";
import { Icon } from "../../shared/ui/icon";

/** Deep links select history; ordinary navigation restores the existing session. */
@Component({
  selector: "assistant-entry",
  imports: [RouterLink, Icon],
  styleUrl: "./assistant-entry.css",
  host: {
    "(document:pointerdown)": "dismissOutside($event)",
    "(keydown.escape)": "closeOverview($event)",
  },
  template: `
    <details #overview class="home-overview">
      <summary>
        <span class="overview-label"><app-icon name="overview" />{{ shortPeriod() }}</span>
        @if (summary.hasValue()) { @let data = summary.value();
          <span class="overview-metric"><span>Gasto neto</span><strong>{{ money(data.spending) }}</strong></span>
          <span class="overview-metric overview-secondary"><span>Recibido</span><strong>{{ money(data.receivedIncome) }}</strong></span>
          <span class="overview-metric overview-secondary"><span>Esperado</span><strong>{{ money(data.expectedIncome.amount) }}</strong></span>
        } @else { <span class="overview-status">{{ summary.error() ? 'Resumen no disponible' : 'Cargando cifras…' }}</span> }
        <app-icon class="overview-chevron" name="chevron" />
      </summary>
      <div class="overview-details">
        <div class="overview-heading"><strong>{{ period() }}</strong><label class="button month-picker"><span class="sr-only">Mes del resumen</span><input #picker type="month" [value]="month()" [max]="maxMonth" (change)="selectMonth(picker.value)" /></label></div>
        @if (summary.hasValue()) { @let data = summary.value();
          <section class="financial-snapshot" aria-label="Cifras del mes">
            <a routerLink="/movimientos"><span>Gasto neto</span><strong>{{ money(data.spending) }}</strong><small>Compras menos recuperaciones confirmadas</small></a>
            <a routerLink="/ingresos" [queryParams]="{ month: month() }"><span>Ingresos recibidos</span><strong>{{ money(data.receivedIncome) }}</strong><small>Confirmados al corte · no es tu saldo</small></a>
            <a routerLink="/ingresos/fuentes"><span>Ingresos esperados</span><strong>{{ money(data.expectedIncome.amount) }}</strong><small>Plan del mes · no es dinero disponible @if (data.expectedIncome.estimatedAmount !== '0.00') { · Incluye estimaciones } @if (data.expectedIncome.unknownAmountCount) { · Importes por definir }</small></a>
          </section>
          @if (data.unresolvedMovementCount || data.unresolvedAdjustmentCount) { <p class="field-hint">Hay movimientos o ajustes por revisar. Los importes pendientes no reducen el gasto.</p> }
        } @else if (summary.error()) { <p role="status">No pudimos cargar las cifras. <button class="text-link" type="button" (click)="summary.reload()">Reintentar resumen</button></p> }
        <a class="text-link" routerLink="/dashboard">Resumen completo ↗</a>
      </div>
    </details>
  `,
})
export class AssistantEntry {
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly overview =
    viewChild<ElementRef<HTMLDetailsElement>>("overview");
  protected readonly workspace = inject(AssistantWorkspace);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);
  private readonly rpc = inject(RpcClient);
  protected readonly maxMonth = currentMonth();
  protected readonly month = signal(this.maxMonth);
  protected readonly period = computed(() => monthLabel(this.month()));
  protected readonly shortPeriod = computed(() =>
    new Intl.DateTimeFormat("es-CL", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${this.month()}-01T12:00:00Z`)),
  );
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

  protected dismissOutside(event: Event) {
    if (
      event.target instanceof Node &&
      !this.element.nativeElement.contains(event.target)
    ) {
      const overview = this.overview()?.nativeElement;
      if (overview) overview.open = false;
    }
  }

  protected closeOverview(event: Event) {
    const overview = this.overview()?.nativeElement;
    if (!overview?.open) return;
    overview.open = false;
    overview.querySelector("summary")?.focus();
    event.stopPropagation();
  }
}
