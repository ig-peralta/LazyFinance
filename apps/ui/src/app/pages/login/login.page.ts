import {
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
} from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { AuthApi } from "../../core/auth/auth-api";
import { SessionService } from "../../core/auth/session.service";

@Component({
  selector: "login-page",
  imports: [RouterLink],
  templateUrl: "./login.page.html",
})
export class LoginPage {
  readonly session = inject(SessionService);
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly config = resource({
    loader: ({ abortSignal }) => this.api.config(abortSignal),
  });
  readonly provider = computed(() =>
    this.config.hasValue() ? this.config.value().provider : null,
  );
  readonly loadingConfig = this.config.isLoading;
  readonly loading = signal(false);
  private readonly commandError = signal<string | null>(null);
  readonly error = computed(
    () =>
      this.commandError() ??
      (this.config.error()
        ? "No se pudieron cargar las opciones de acceso. Inténtalo de nuevo."
        : null),
  );

  constructor() {
    effect(() => {
      if (
        this.provider() === "firebase" &&
        this.session.active() &&
        this.route.snapshot.queryParamMap.has("redirect")
      ) {
        void this.router.navigateByUrl(this.destination());
      }
    });
  }

  async loginWithMock(email: string, password: string): Promise<void> {
    if (this.loading() || this.provider() !== "mock") return;

    this.loading.set(true);
    this.commandError.set(null);
    try {
      const { token } = await this.api.loginMock(email, password);
      await this.session.loginWithToken(token);
      await this.router.navigateByUrl(this.destination());
    } catch {
      this.commandError.set(
        "No se pudo iniciar sesión. Revisa tus credenciales e inténtalo de nuevo.",
      );
    } finally {
      this.loading.set(false);
    }
  }

  async loginWithGoogle(): Promise<void> {
    if (this.loading() || this.provider() !== "firebase") return;
    this.loading.set(true);
    this.commandError.set(null);
    try {
      await this.session.loginWithGoogle();
      await this.router.navigateByUrl(this.destination());
    } catch {
      this.commandError.set(
        "No se pudo iniciar sesión con Google. Verifica tu cuenta e inténtalo de nuevo.",
      );
    } finally {
      this.loading.set(false);
    }
  }

  async logout(): Promise<void> {
    try {
      await this.session.logout();
    } catch {
      this.commandError.set(
        "No se pudo cerrar la sesión completamente. Inténtalo de nuevo.",
      );
    }
  }

  private destination(): string {
    const redirect = this.route.snapshot.queryParamMap.get("redirect");
    return redirect?.startsWith("/") && !redirect.startsWith("//")
      ? redirect
      : "/dashboard";
  }
}
