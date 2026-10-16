import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../services/session/session.service';

const DEMO_TOKEN = 'lazyfinance-demo-token';

@Component({
  selector: 'login-page',
  imports: [RouterLink],
  templateUrl: './login.page.html',
})
export class LoginPage {
  readonly session = inject(SessionService);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async loginAsDemo(): Promise<void> {
    if (this.loading()) return;

    this.loading.set(true);
    this.error.set(null);
    try {
      await this.session.loginWithToken(DEMO_TOKEN);
    } catch {
      this.error.set('No se pudo iniciar la sesión de demostración. Inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  logout(): void {
    this.session.clear();
  }
}
