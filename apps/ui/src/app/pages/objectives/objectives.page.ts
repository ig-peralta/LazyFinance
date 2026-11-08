import { Component, computed, effect, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MonthSchema } from "@lazyfinance/contracts";
import { formatClp, progressWidth } from "../../../utils/currency";
import { currentMonth } from "../../../utils/month";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { reportWorkspaceReadiness } from "../../core/rendering/workspace-preparation";
import { ObjectivesData } from "../../features/objectives/objectives.data";
import { TaggingData } from "../../features/tagging/tagging.data";
import { EditorDrawer } from "../../shared/ui/editor-drawer";
import { Icon } from "../../shared/ui/icon";
import { BudgetEditor } from "./budgets/budget-editor/budget-editor";
import { objectivePeriod } from "./forms/objective-form";

@Component({
  selector: "objectives-page",
  imports: [RouterLink, Icon, BudgetEditor, EditorDrawer],
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
  protected readonly editorOpen = signal(false);
  protected readonly savedId = signal<string | null>(null);
  protected readonly money = formatClp;
  protected readonly width = progressWidth;
  protected readonly period = objectivePeriod;
  protected readonly maxMonth = currentMonth();

  constructor() {
    reportWorkspaceReadiness(this.data.objectives, this.data.progress);
    const credentials = inject(AuthCredentials),
      owner = computed(() => credentials.current()?.principal.userId);
    effect(() => {
      owner();
      this.savedId.set(null);
      this.editorOpen.set(false);
    });
  }

  protected month(value: string) {
    if (MonthSchema.safeParse(value).success && value <= this.maxMonth)
      this.data.month.set(value);
  }

  protected created(id: string) {
    this.savedId.set(id);
    this.editorOpen.set(false);
    this.data.objectives.reload();
    this.data.progress.reload();
  }
}
