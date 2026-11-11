import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { SessionService } from "../../core/auth/session.service";
import { mcpInteractionId } from "../../features/mcp-authorization/interaction-id";
import { WorkspacePreferences } from "../../layout/app-shell/workspace-preferences";
import { Icon } from "../../shared/ui/icon";
import { LoginPage } from "../login/login.page";
import { McpConsentPage } from "./mcp-consent.page";

@Component({
  selector: "mcp-authorization-page",
  imports: [RouterLink, Icon, LoginPage, McpConsentPage],
  templateUrl: "./mcp-authorization.page.html",
  styleUrl: "./mcp-authorization.page.css",
})
export class McpAuthorizationPage {
  protected readonly preferences = inject(WorkspacePreferences);
  protected readonly session = inject(SessionService);
  private readonly credentials = inject(AuthCredentials);
  private readonly lifetime = inject(DestroyRef);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);
  private readonly frame = viewChild<ElementRef<HTMLElement>>("frame");
  protected readonly switching = signal(false);
  protected readonly switchError = signal(false);
  protected readonly id = computed(() =>
    mcpInteractionId(this.query()?.get("interaction")),
  );
  protected readonly interactions = computed(() => {
    const id = this.id();
    return id ? [id] : [];
  });
  protected readonly owners = computed(() => {
    const owner = this.credentials.current();
    return this.id() &&
      owner &&
      this.session.status() === "ready" &&
      !this.session.isResolving() &&
      !this.switching()
      ? [owner.principal.userId]
      : [];
  });
  protected readonly stage = computed(() =>
    !this.id()
      ? "invalid"
      : this.switchError()
        ? "error"
        : this.owners().length
          ? "consent"
          : this.session.status(),
  );

  constructor() {
    void this.session.start();
    afterRenderEffect(() => {
      this.id();
      this.stage();
      untracked(() =>
        this.frame()?.nativeElement.querySelector<HTMLElement>("h1")?.focus(),
      );
    });
  }

  protected async changeAccount() {
    if (this.switching()) return;
    const id = this.id();
    this.switching.set(true);
    this.switchError.set(false);
    try {
      await this.session.logout();
    } catch {
      if (!this.lifetime.destroyed && this.id() === id)
        this.switchError.set(true);
    } finally {
      if (!this.lifetime.destroyed) this.switching.set(false);
    }
  }
}
