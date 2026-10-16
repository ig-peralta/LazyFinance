import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../services/session/session.service';
import { Account } from './account/account';
import { Activity } from './activity/activity';
import { Objective } from './objective/objective';

@Component({
  selector: 'dashboard-page',
  imports: [Account, Activity, Objective, RouterLink],
  templateUrl: './dashboard.page.html',
})
export class DashboardPage {
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected logout(): void {
    this.session.clear();
    void this.router.navigateByUrl('/');
  }
}
