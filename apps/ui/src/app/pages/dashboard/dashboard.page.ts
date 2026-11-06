import { Component, inject } from "@angular/core";
import { SessionService } from "../../core/auth/session.service";
import { AccountsData } from "../../features/accounts/accounts.data";
import { ObjectivesData } from "../../features/objectives/objectives.data";
import { SummariesData } from "../../features/summaries/summaries.data";
import { TaggingData } from "../../features/tagging/tagging.data";
import { TransactionsData } from "../../features/transactions/transactions.data";
import { Account } from "./account/account";
import { Activity } from "./activity/activity";
import { BudgetProgressView } from "./budget-progress/budget-progress";
import { Comparison } from "./comparison/comparison";
import { Objective } from "./objective/objective";
import { Summary } from "./summary/summary";

@Component({
  selector: "dashboard-page",
  imports: [
    Account,
    Activity,
    Objective,
    Summary,
    Comparison,
    BudgetProgressView,
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
}
