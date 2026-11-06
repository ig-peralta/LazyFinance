import { Component, inject } from "@angular/core";
import { formatClp } from "../../../../utils/currency";
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
    return formatClp(Number(amount));
  }

  protected change(amount: string, noun: string): string {
    const value = Number(amount);
    if (value === 0) return `${noun} sin cambios`;
    return `${formatClp(Math.abs(value))} ${value > 0 ? "más" : "menos"}`;
  }
}
