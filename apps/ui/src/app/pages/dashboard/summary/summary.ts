import { Component, computed, inject } from "@angular/core";
import { formatClp } from "../../../../utils/currency";
import { monthLabel } from "../../../../utils/month";
import { SummariesData } from "../../../features/summaries/summaries.data";

@Component({ selector: "dashboard-summary", templateUrl: "./summary.html" })
export class Summary {
  private readonly data = inject(SummariesData);
  protected readonly summary = this.data.monthly;
  protected readonly period = computed(() => monthLabel(this.data.month()));

  protected readonly tagBars = computed(() => {
    const tags = this.summary.hasValue() ? [...this.summary.value().tags] : [];
    tags.sort(
      (left, right) =>
        Number(right.amount) - Number(left.amount) ||
        left.name.localeCompare(right.name),
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

  protected money(value: string): string {
    return formatClp(Number(value));
  }
}
