import { Component, computed, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MonthSchema } from "@lazyfinance/contracts";
import { formatClp } from "../../../utils/currency";
import { currentMonth } from "../../../utils/month";
import { SessionService } from "../../core/auth/session.service";
import { AccountsData } from "../../features/accounts/accounts.data";
import { ObjectivesData } from "../../features/objectives/objectives.data";
import { SavingsMeasure } from "../../features/objectives/savings-measure";
import { SummariesData } from "../../features/summaries/summaries.data";
import { TaggingData } from "../../features/tagging/tagging.data";
import { TransactionsData } from "../../features/transactions/transactions.data";
import { Icon } from "../../shared/ui/icon";
import { Account } from "./account/account";
import { Activity } from "./activity/activity";
import { BudgetProgressView } from "./budget-progress/budget-progress";
import { Comparison } from "./comparison/comparison";
import { Summary } from "./summary/summary";

@Component({
  selector: "dashboard-page",
  imports: [
    Account,
    Activity,
    SavingsMeasure,
    RouterLink,
    Summary,
    Comparison,
    BudgetProgressView,
    Icon,
  ],
  providers: [
    AccountsData,
    ObjectivesData,
    SummariesData,
    TaggingData,
    TransactionsData,
  ],
  templateUrl: "./dashboard.page.html",
})
export class DashboardPage {
  protected readonly session = inject(SessionService);
  protected readonly summaries = inject(SummariesData);
  protected readonly objectives = inject(ObjectivesData);
  protected readonly firstSavings = computed(() =>
    this.objectives.objectives.hasValue()
      ? this.objectives.objectives
          .value()
          .find((item) => item.intent === "saving")
      : undefined,
  );
  protected readonly maxMonth = currentMonth();
  protected readonly money = formatClp;

  protected selectMonth(month: string) {
    if (!MonthSchema.safeParse(month).success || month > this.maxMonth) return;
    this.summaries.month.set(month);
    this.objectives.month.set(month);
  }
}
