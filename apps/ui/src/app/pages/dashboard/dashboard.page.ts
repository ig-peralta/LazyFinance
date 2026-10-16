import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../services/session/session.service';
import { Account } from './account/account';

@Component({
  selector: 'dashboard-page',
  imports: [Account, RouterLink],
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
