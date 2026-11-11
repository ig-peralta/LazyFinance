import { Component, computed, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { formatClp } from "../../../../utils/currency";
import { monthLabel } from "../../../../utils/month";
import { spendingDistribution } from "../../../features/summaries/spending-distribution";
import { SummariesData } from "../../../features/summaries/summaries.data";

@Component({
  selector: "dashboard-summary",
  imports: [RouterLink],
  templateUrl: "./summary.html",
})
export class Summary {
  private readonly data = inject(SummariesData);
  protected readonly summary = this.data.monthly;
  protected readonly period = computed(() => monthLabel(this.data.month()));

  protected readonly distribution = computed(() =>
    this.summary.hasValue()
      ? spendingDistribution(this.summary.value())
      : undefined,
  );

  protected money(value: string): string {
    return formatClp(value);
  }
}
