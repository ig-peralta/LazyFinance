import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { AuthProvider } from '@lazyfinance/contracts';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../services/api/api.service';
import { SessionService } from '../../services/session/session.service';

@Component({
  selector: 'login-page',
  imports: [RouterLink],
  templateUrl: './login.page.html',
})
export class LoginPage implements OnInit {
  readonly session = inject(SessionService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly provider = signal<AuthProvider | null>(null);
  readonly loadingConfig = signal(true);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadProvider();
  }

  async loadProvider(): Promise<void> {
    this.loadingConfig.set(true);
    this.error.set(null);
    try {
      const config = await firstValueFrom(this.api.getAuthConfig());
      this.provider.set(config.provider);
      if (config.provider === 'firebase' && this.session.active() && this.route.snapshot.queryParamMap.has('redirect')) {
        await this.router.navigateByUrl(this.destination());
      }
    } catch {
      this.provider.set(null);
      this.error.set('No se pudieron cargar las opciones de acceso. Inténtalo de nuevo.');
    } finally {
      this.loadingConfig.set(false);
    }
  }

  async loginWithMock(email: string, password: string): Promise<void> {
    if (this.loading() || this.provider() !== 'mock') return;

    this.loading.set(true);
    this.error.set(null);
    try {
      const { token } = await firstValueFrom(this.api.loginMock(email, password));
      await this.session.loginWithToken(token);
      await this.router.navigateByUrl(this.destination());
    } catch {
      this.error.set('No se pudo iniciar sesión. Revisa tus credenciales e inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async loginWithGoogle(): Promise<void> {
    if (this.loading() || this.provider() !== 'firebase') return;
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.session.loginWithGoogle();
      await this.router.navigateByUrl(this.destination());
    } catch {
      this.error.set('No se pudo iniciar sesión con Google. Verifica tu cuenta e inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async logout(): Promise<void> {
    try {
      await this.session.logout();
    } catch {
      this.error.set('No se pudo cerrar la sesión completamente. Inténtalo de nuevo.');
    }
  }

  private destination(): string {
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    return redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : '/dashboard';
  }
}
