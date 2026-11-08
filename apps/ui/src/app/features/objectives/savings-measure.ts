import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type { ObjectiveSummary } from "@lazyfinance/contracts";
import { formatClp, progressWidth } from "../../../utils/currency";
import { formatDate } from "../../../utils/date";
import { RpcClient } from "../../core/rpc/rpc-client";
import { Icon } from "../../shared/ui/icon";
import { createCursorTrail } from "../pagination/cursor-trail";
import { TaggingData } from "../tagging/tagging.data";

@Component({
  selector: "savings-measure",
  imports: [RouterLink, Icon],
  templateUrl: "./savings-measure.html",
})
export class SavingsMeasure {
  readonly goal = input.required<ObjectiveSummary>();
  readonly month = input.required<string>();
  readonly compact = input(false);
  private readonly rpc = inject(RpcClient);
  private readonly tagging = inject(TaggingData, { optional: true });
  protected readonly progress = resource({
    params: () => {
      const scope = this.rpc.authenticatedScope();
      return (
        scope && {
          scope,
          id: this.goal().id,
          month: this.month(),
          revision: this.goal(),
          decision: this.tagging?.changed(),
        }
      );
    },
    loader: ({ params: { scope, id, month }, abortSignal }) =>
      scope.client.objectives.savingsProgress.query(
        { id, month },
        { signal: abortSignal },
      ),
  });
  protected readonly showEvidence = signal(false);
  private readonly selection = computed(() => {
    const scope = this.rpc.authenticatedScope();
    if (
      !scope ||
      !this.showEvidence() ||
      !this.progress.hasValue() ||
      this.progress.isLoading()
    )
      return undefined;
    const data = this.progress.value();
    return {
      scope,
      id: data.goal.id,
      version: data.goal.version,
      month: data.month,
      asOf: data.tracking.asOf,
    };
  });
  protected readonly trail = createCursorTrail<{
    cursor: string;
    asOf: string;
  }>(this.selection);
  protected readonly evidence = resource({
    params: () => {
      const selection = this.selection();
      return selection && { ...selection, ...this.trail.entry() };
    },
    loader: ({ params: { scope, id, month, asOf, cursor }, abortSignal }) =>
      scope.client.objectives.savingsContributions.query(
        { id, month, asOf, cursor, limit: 15 },
        { signal: abortSignal },
      ),
  });
  protected readonly uncertain = computed(
    () =>
      this.progress.hasValue() &&
      (!this.progress.value().historyCoverage.length ||
        this.progress
          .value()
          .historyCoverage.some(
            (account) => account.completeness !== "complete",
          )),
  );
  protected readonly money = formatClp;
  protected readonly width = progressWidth;
  protected readonly date = (value: string) => formatDate(new Date(value));

  protected next() {
    if (this.evidence.hasValue() && !this.evidence.isLoading()) {
      const data = this.evidence.value(),
        cursor = data.pageInfo.nextCursor;
      if (cursor) this.trail.next({ cursor, asOf: data.tracking.asOf });
    }
  }
}
