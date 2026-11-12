import { Component, computed, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { AssistantSource } from "@lazyfinance/contracts";
import { MonthlySummarySchema } from "@lazyfinance/contracts";
import { spendingDistribution } from "../../../features/summaries/spending-distribution";
import { Icon } from "../../../shared/ui/icon";
import { assistantReferenceView } from "./assistant-reference-view";

@Component({
  selector: "assistant-reference",
  imports: [RouterLink, Icon],
  templateUrl: "./assistant-reference.html",
  styleUrl: "./assistant-reference.css",
})
export class AssistantReference {
  readonly source = input.required<AssistantSource>();
  readonly expanded = input(false);
  protected readonly view = computed(() =>
    assistantReferenceView(this.source(), this.expanded()),
  );
  protected readonly chart = computed(() => {
    const source = this.source();
    if (
      !this.expanded() ||
      source.status !== "available" ||
      source.tool !== "get_monthly_spending_summary"
    )
      return;
    const parsed = MonthlySummarySchema.pick({
      spending: true,
      tags: true,
    }).safeParse(source.data);
    return parsed.success ? spendingDistribution(parsed.data) : undefined;
  });
  protected readonly time = (value: string) =>
    new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
}
