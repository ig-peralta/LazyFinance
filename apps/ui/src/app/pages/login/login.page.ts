import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  resource,
  signal,
} from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { AuthApi } from "../../core/auth/auth-api";
import { type AuthAction, authErrorMessage } from "../../core/auth/auth-error";
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
  private readonly lifetime = new AbortController();
  private leaving = false;

  readonly config = resource({
    loader: ({ abortSignal }) => this.api.config(abortSignal),
  });

  readonly provider = computed(() =>
    this.config.hasValue() ? this.config.value().provider : null,
  );

  readonly loadingConfig = this.config.isLoading;
  readonly loading = signal(false);
  readonly busy = computed(() => this.loading() || this.session.isResolving());
  readonly passwordMode = signal<"signin" | "register">("signin");
  readonly notice = signal<string | null>(null);
  readonly needsVerification = computed(
    () =>
      this.provider() === "firebase" &&
      !this.session.active() &&
      this.session.firebaseAccount()?.emailVerified === false,
  );
  private readonly commandError = signal<string | null>(null);

  readonly error = computed(
    () =>
      this.commandError() ??
      (this.config.error()
        ? "No se pudieron cargar las opciones de acceso. Inténtalo de nuevo."
        : null),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.lifetime.abort());
    effect(() => {
      if (
        this.provider() === "firebase" &&
        this.session.active() &&
        !this.busy() &&
        this.route.snapshot.queryParamMap.has("redirect")
      ) {
        void this.completeLogin().catch(() =>
          this.commandError.set("No pudimos abrir la página de destino."),
        );
      }
    });
  }

  async loginWithMock(email: string, password: string): Promise<void> {
    if (this.provider() !== "mock") return;
    await this.execute("signin", async () => {
      const { token } = await this.api.loginMock(email, password);
      this.lifetime.signal.throwIfAborted();
      await this.session.loginWithToken(token);
      await this.completeLogin();
    });
  }

  async loginWithGoogle(): Promise<void> {
    if (this.provider() !== "firebase") return;
    await this.execute("signin", async () => {
      await this.session.loginWithGoogle(this.lifetime.signal);
      await this.completeLogin();
    });
  }

  setPasswordMode(mode: "signin" | "register"): void {
    if (this.busy()) return;
    this.passwordMode.set(mode);
    this.commandError.set(null);
    this.notice.set(null);
  }

  async submitPassword(
    event: Event,
    email: HTMLInputElement,
    password: HTMLInputElement,
    confirmation: HTMLInputElement,
  ): Promise<void> {
    event.preventDefault();
    if (this.busy() || this.provider() !== "firebase") return;
    const value = password.value;
    const confirm = confirmation.value;
    password.value = "";
    confirmation.value = "";
    const mode = this.passwordMode();
    if (mode === "register" && value !== confirm) {
      this.commandError.set("Las contraseñas no coinciden.");
      return;
    }

    await this.execute(
      mode === "register" ? "register" : "signin",
      async () => {
        if (mode === "register") {
          await this.session.registerWithPassword(
            email.value,
            value,
            this.lifetime.signal,
          );
          this.notice.set(
            "Enviamos un correo de verificación. Confírmalo antes de continuar.",
          );
        } else {
          await this.session.loginWithPassword(
            email.value,
            value,
            this.lifetime.signal,
          );
          await this.completeLogin();
        }
      },
    );
  }

  async resendVerification(): Promise<void> {
    await this.execute("verify", async () => {
      await this.session.resendVerification(this.lifetime.signal);
      this.notice.set(
        "Enviamos de nuevo el correo de verificación. Revisa también tu carpeta de spam.",
      );
    });
  }

  async checkVerification(): Promise<void> {
    await this.execute("verify", async () => {
      if (await this.session.checkEmailVerification(this.lifetime.signal)) {
        await this.completeLogin();
      } else {
        this.notice.set(
          "El correo aún no está verificado. Abre el enlace recibido y vuelve a comprobarlo.",
        );
      }
    });
  }

  async sendPasswordReset(email: HTMLInputElement): Promise<void> {
    if (!email.reportValidity()) return;
    await this.execute("reset", async () => {
      await this.session.resetPassword(email.value, this.lifetime.signal);
      this.notice.set(
        "Si la cuenta admite contraseña, recibirás un correo con instrucciones para recuperarla.",
      );
    });
  }

  async logout(): Promise<void> {
    try {
      await this.session.logout();
      this.notice.set(null);
      this.commandError.set(null);
      this.leaving = false;
    } catch {
      this.commandError.set(
        "No se pudo cerrar la sesión completamente. Inténtalo de nuevo.",
      );
    }
  }

  private async execute(
    action: AuthAction,
    operation: () => Promise<void>,
  ): Promise<void> {
    if (this.busy() || this.lifetime.signal.aborted) return;
    this.loading.set(true);
    this.commandError.set(null);
    this.notice.set(null);
    try {
      await operation();
    } catch (error) {
      if (!this.lifetime.signal.aborted)
        this.commandError.set(authErrorMessage(error, action));
    } finally {
      this.loading.set(false);
    }
  }

  private async completeLogin(): Promise<void> {
    this.lifetime.signal.throwIfAborted();
    if (this.leaving) return;
    this.leaving = true;
    try {
      if (!(await this.router.navigateByUrl(this.destination())))
        this.leaving = false;
    } catch (error) {
      this.leaving = false;
      throw error;
    }
  }

  private destination(): string {
    const redirect = this.route.snapshot.queryParamMap.get("redirect");
    return redirect?.startsWith("/") && !redirect.startsWith("//")
      ? redirect
      : "/dashboard";
  }
}
