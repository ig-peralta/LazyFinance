import { Component, computed, inject } from "@angular/core";
import type { BudgetProgress } from "@lazyfinance/contracts";
import { formatClp } from "../../../../utils/currency";
import { monthLabel } from "../../../../utils/month";
import { ObjectivesData } from "../../../features/objectives/objectives.data";

@Component({
  selector: "dashboard-budget-progress",
  templateUrl: "./budget-progress.html",
})
export class BudgetProgressView {
  private readonly data = inject(ObjectivesData);
  protected readonly budgets = this.data.progress;
  protected readonly label = computed(() => monthLabel(this.data.month()));

  protected money(value: string): string {
    return formatClp(Number(value));
  }

  protected barWidth(value: number): number {
    return Math.min(value, 100);
  }

  protected periodLabel(period: BudgetProgress["period"]): string {
    return period === "monthly"
      ? "Mes"
      : period === "yearly"
        ? "Año hasta hoy"
        : "Período definido";
  }
}
