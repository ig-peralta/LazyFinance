import { Component, computed, effect, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MonthSchema } from "@lazyfinance/contracts";
import { formatClp, progressWidth } from "../../../utils/currency";
import { currentMonth } from "../../../utils/month";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { ObjectivesData } from "../../features/objectives/objectives.data";
import { TaggingData } from "../../features/tagging/tagging.data";
import { Icon } from "../../shared/ui/icon";
import { BudgetEditor } from "./budget-editor";
import { objectivePeriod } from "./objective-form";

@Component({
  selector: "objectives-page",
  imports: [RouterLink, Icon, BudgetEditor],
  providers: [ObjectivesData, TaggingData],
  templateUrl: "./objectives.page.html",
})
export class ObjectivesPage {
  protected readonly data = inject(ObjectivesData);
  protected readonly items = computed(() =>
    (this.data.objectives.hasValue()
      ? this.data.objectives.value()
      : []
    ).filter((item) => item.intent === "spending"),
  );
  protected readonly editorKey = signal(0);
  protected readonly savedId = signal<string | null>(null);
  protected readonly money = formatClp;
  protected readonly width = progressWidth;
  protected readonly period = objectivePeriod;
  protected readonly maxMonth = currentMonth();

  constructor() {
    const credentials = inject(AuthCredentials),
      owner = computed(() => credentials.current()?.principal.userId);
    effect(() => {
      owner();
      this.savedId.set(null);
      this.editorKey.update((key) => key + 1);
    });
  }

  protected month(value: string) {
    if (MonthSchema.safeParse(value).success && value <= this.maxMonth)
      this.data.month.set(value);
  }

  protected created(id: string) {
    this.savedId.set(id);
    this.editorKey.update((key) => key + 1);
    this.data.objectives.reload();
    this.data.progress.reload();
  }
}
