import { Component, computed, inject } from "@angular/core";
import {
  formatClp,
  moneyCents,
  progressWidth,
} from "../../../../utils/currency";
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
        (moneyCents(right.amount) > moneyCents(left.amount)
          ? 1
          : moneyCents(right.amount) < moneyCents(left.amount)
            ? -1
            : 0) || left.name.localeCompare(right.name),
    );
    const maximum = tags[0]?.amount ?? "0.00";

    return tags.map((tag) => ({
      ...tag,
      width: progressWidth(tag.amount, maximum),
    }));
  });

  protected money(value: string): string {
    return formatClp(value);
  }
}
