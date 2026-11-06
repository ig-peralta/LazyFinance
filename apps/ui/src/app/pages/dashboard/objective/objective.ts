import { Component, computed, inject } from "@angular/core";
import type { ObjectiveSummary } from "@lazyfinance/contracts";
import { formatClp } from "../../../../utils/currency";
import { formatDate } from "../../../../utils/date";
import { ObjectivesData } from "../../../features/objectives/objectives.data";

@Component({ selector: "dashboard-objective", templateUrl: "./objective.html" })
export class Objective {
  protected readonly objectives = inject(ObjectivesData).objectives;
  protected readonly budgets = computed(() =>
    this.objectives.hasValue()
      ? this.objectives.value().filter((item) => item.intent === "spending")
      : [],
  );
  protected readonly goals = computed(() =>
    this.objectives.hasValue()
      ? this.objectives.value().filter((item) => item.intent === "saving")
      : [],
  );

  protected target(amount: string): string {
    return formatClp(Number(amount));
  }

  protected periodLabel(item: ObjectiveSummary): string {
    if (item.kind === "amount_based") return "Sin fecha límite";
    if (item.isRecurring) {
      switch (item.period) {
        case "daily":
          return "Diario";
        case "weekly":
          return "Semanal";
        case "monthly":
          return "Mensual";
        case "yearly":
          return "Anual";
      }
    }
    if (item.startDate && item.endDate) {
      return `Inicio: ${formatDate(new Date(item.startDate))} · Fin: ${formatDate(new Date(item.endDate))}`;
    }
    return "Período único";
  }
}
