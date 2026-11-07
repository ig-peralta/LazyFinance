import { Component, computed, DestroyRef, inject, signal } from "@angular/core";
import { type AuthAction, authErrorMessage } from "../../core/auth/auth-error";
import { SessionService } from "../../core/auth/session.service";

@Component({
  selector: "security-page",
  templateUrl: "./security.page.html",
})
export class SecurityPage {
  readonly session = inject(SessionService);
  private readonly lifetime = new AbortController();
  private readonly owner = computed(() => {
    const user = this.session.user();
    const account = this.session.firebaseAccount();
    return this.session.active() && user && account
      ? `${user.userId}:${account.uid}`
      : null;
  });
  private readonly command = signal<{
    owner: string;
    pending: boolean;
    error: string | null;
    notice: string | null;
  } | null>(null);
  private readonly current = computed(() =>
    this.command()?.owner === this.owner() ? this.command() : null,
  );

  readonly account = computed(() =>
    this.owner() ? this.session.firebaseAccount() : null,
  );
  readonly busy = computed(
    () => Boolean(this.current()?.pending) || this.session.isResolving(),
  );
  readonly error = computed(() => this.current()?.error ?? null);
  readonly notice = computed(() => this.current()?.notice ?? null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.lifetime.abort());
  }

  async prepareGoogle(event: Event, password: HTMLInputElement): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    const value = password.value;
    password.value = "";
    await this.execute("link", async (signal) => {
      await this.session.prepareGoogleLink(value, signal);
      return "Identidad confirmada. Pulsa Conectar Google para elegir la cuenta que quieres conectar.";
    });
  }

  async linkGoogle(): Promise<void> {
    await this.execute("link", async (signal) => {
      await this.session.linkGoogle(signal);
      return "Google quedó conectado a tu misma cuenta de LazyFinance.";
    });
  }

  async addPassword(
    event: Event,
    password: HTMLInputElement,
    confirmation: HTMLInputElement,
  ): Promise<void> {
    event.preventDefault();
    const owner = this.owner();
    if (!owner || this.busy()) return;
    const value = password.value;
    const confirm = confirmation.value;
    password.value = "";
    confirmation.value = "";
    if (value !== confirm) {
      this.command.set({
        owner,
        pending: false,
        error: "Las contraseñas no coinciden.",
        notice: null,
      });
      return;
    }
    await this.execute("link", async (signal) => {
      await this.session.linkPassword(value, signal);
      return "La contraseña quedó conectada a tu misma cuenta de LazyFinance.";
    });
  }

  async resendVerification(): Promise<void> {
    await this.execute("verify", async (signal) => {
      await this.session.resendVerification(signal);
      return "Enviamos el enlace de verificación a tu correo.";
    });
  }

  async checkVerification(): Promise<void> {
    await this.execute("verify", async (signal) =>
      (await this.session.checkEmailVerification(signal))
        ? "Correo verificado. Ya puedes conectar una contraseña."
        : "El correo aún no está verificado. Abre el enlace recibido y vuelve a comprobarlo.",
    );
  }

  private async execute(
    action: AuthAction,
    operation: (signal: AbortSignal) => Promise<string>,
  ): Promise<void> {
    const owner = this.owner();
    if (!owner || this.busy() || this.lifetime.signal.aborted) return;
    const state = { owner, pending: true, error: null, notice: null };
    this.command.set(state);
    try {
      const notice = await operation(this.lifetime.signal);
      if (
        !this.lifetime.signal.aborted &&
        this.command() === state &&
        this.owner() === owner
      ) {
        this.command.set({ owner, pending: false, error: null, notice });
      }
    } catch (error) {
      if (
        !this.lifetime.signal.aborted &&
        this.command() === state &&
        this.owner() === owner
      ) {
        this.command.set({
          owner,
          pending: false,
          error: authErrorMessage(error, action),
          notice: null,
        });
      }
    }
  }
}
