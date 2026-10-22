import { Component, inject } from '@angular/core';
import { SessionService } from '../../services/session/session.service';
import { Account } from './account/account';
import { Activity } from './activity/activity';
import { Objective } from './objective/objective';
import { Summary } from './summary/summary';
import { Comparison } from './comparison/comparison';
import { BudgetProgressView } from './budget-progress/budget-progress';

@Component({
  selector: 'dashboard-page',
  imports: [Account, Activity, Objective, Summary, Comparison, BudgetProgressView],
  templateUrl: './dashboard.page.html',
})
export class DashboardPage {
  protected readonly session = inject(SessionService);
}
