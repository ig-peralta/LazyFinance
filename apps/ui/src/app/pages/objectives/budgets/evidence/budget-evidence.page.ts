import { Component, computed, inject, resource } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { BudgetContributionsInputSchema } from "@lazyfinance/contracts";
import { formatClp, moneyCents } from "../../../../../utils/currency";
import { formatDate } from "../../../../../utils/date";
import { RpcClient } from "../../../../core/rpc/rpc-client";
import { createCursorTrail } from "../../../../features/pagination/cursor-trail";
import { Icon } from "../../../../shared/ui/icon";

interface Continuation {
  cursor: string;
  asOf: string;
  adjustmentsAsOf: string;
}

@Component({
  selector: "budget-evidence-page",
  imports: [RouterLink, Icon],
  templateUrl: "./budget-evidence.page.html",
})
export class BudgetEvidencePage {
  private readonly rpc = inject(RpcClient);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly id = computed(() => this.params().get("id"));
  private readonly parsed = computed(() => {
    const query = this.query();
    return BudgetContributionsInputSchema.safeParse({
      id: this.id(),
      revisionId: query.get("revision"),
      month: query.get("month") ?? undefined,
      asOf: query.get("asOf") ?? undefined,
      adjustmentsAsOf: query.get("adjustmentsAsOf") ?? undefined,
      limit: 25,
    });
  });
  protected readonly valid = computed(() => this.parsed().success);
  private readonly selection = computed(() => {
    const scope = this.rpc.authenticatedScope(),
      parsed = this.parsed();
    return scope && parsed.success ? { scope, input: parsed.data } : undefined;
  });
  protected readonly trail = createCursorTrail<Continuation>(this.selection);
  protected readonly page = resource({
    params: () => {
      const selection = this.selection();
      return (
        selection && {
          scope: selection.scope,
          input: { ...selection.input, ...this.trail.entry() },
        }
      );
    },
    loader: ({ params: { scope, input }, abortSignal }) =>
      scope.client.objectives.budgetContributions.query(input, {
        signal: abortSignal,
      }),
  });
  protected readonly reported = computed(() => {
    const value = this.query().get("reported");
    if (value === null) return null;
    try {
      moneyCents(value);
      return value;
    } catch {
      return null;
    }
  });
  protected readonly reconciles = computed(() =>
    this.reported() !== null && this.page.hasValue()
      ? moneyCents(this.reported() ?? "0") ===
        moneyCents(this.page.value().totals.spending)
      : null,
  );
  protected readonly money = formatClp;
  protected readonly date = (value: string) => formatDate(new Date(value));

  protected next() {
    if (!this.page.hasValue() || this.page.isLoading()) return;
    const page = this.page.value(),
      cursor = page.pageInfo.nextCursor;
    if (cursor)
      this.trail.next({
        cursor,
        asOf: page.tracking.asOf,
        adjustmentsAsOf: page.tracking.adjustmentsAsOf,
      });
  }

  protected reload() {
    this.trail.reset();
    this.page.reload();
  }
}
