import { Component, inject } from "@angular/core";
import { formatClp, moneyCents } from "../../../../utils/currency";
import { monthLabel } from "../../../../utils/month";
import { SummariesData } from "../../../features/summaries/summaries.data";

@Component({
  selector: "dashboard-comparison",
  templateUrl: "./comparison.html",
})
export class Comparison {
  protected readonly comparison = inject(SummariesData).comparison;

  protected label(month: string): string {
    return monthLabel(month);
  }

  protected money(amount: string): string {
    return formatClp(amount);
  }

  protected change(amount: string, noun: string): string {
    const value = moneyCents(amount);
    if (value === 0n) return `${noun} sin cambios`;

    return `${formatClp(amount.replace(/^-/, ""))} ${value > 0n ? "más" : "menos"}`;
  }
}
