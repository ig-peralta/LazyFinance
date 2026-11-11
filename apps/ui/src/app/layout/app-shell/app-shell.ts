import { DOCUMENT, NgTemplateOutlet } from "@angular/common";
import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from "@angular/router";
import { filter, map } from "rxjs";
import { AuthCredentials } from "../../core/auth/auth-credentials";
import { SessionService } from "../../core/auth/session.service";
import { AssistantWorkspace } from "../../features/assistant/assistant-workspace";
import { OnboardingData } from "../../features/onboarding/onboarding.data";
import { AssistantPage } from "../../pages/assistant/assistant.page";
import { Icon } from "../../shared/ui/icon";
import { bindAssistantShortcut } from "./assistant-shortcut";
import { WorkspaceAppearance } from "./workspace-appearance";
import { workspaceLocation, workspaceNavigation } from "./workspace-navigation";
import { WorkspacePreferences } from "./workspace-preferences";

@Component({
  selector: "app-shell",
  imports: [
    RouterLink,
    RouterOutlet,
    NgTemplateOutlet,
    Icon,
    WorkspaceAppearance,
    AssistantPage,
  ],
  templateUrl: "./app-shell.html",
})
export class AppShell {
  protected readonly preferences = inject(WorkspacePreferences);
  protected readonly assistantWorkspace = inject(AssistantWorkspace);
  private readonly document = inject(DOCUMENT);
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly credentials = inject(AuthCredentials);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly location = computed(() => workspaceLocation(this.url()));
  protected readonly areas = workspaceNavigation;
  private readonly onboarding = inject(OnboardingData);
  protected readonly destinations = computed(() =>
    this.location().area.destinations.filter(
      (destination) =>
        destination.path !== "/comenzar" ||
        this.onboarding.status() === "skipped",
    ),
  );
  private readonly dialog =
    viewChild<ElementRef<HTMLDialogElement>>("menuDialog");
  private readonly content = viewChild<ElementRef<HTMLElement>>("content");
  // Query presence by name so the assistant class stays out of the eager bundle.
  private readonly assistantHost = viewChild("assistantHost");
  private readonly assistantLauncher =
    viewChild<ElementRef<HTMLButtonElement>>("assistantLauncher");
  private readonly assistantPendingCancel = viewChild<
    ElementRef<HTMLButtonElement>
  >("assistantPendingCancel");
  protected readonly person = computed(
    () => this.credentials.current()?.principal.name ?? "Tu espacio",
  );
  protected readonly initials = computed(() =>
    this.person()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join(""),
  );

  protected readonly menuOpen = signal(false);
  protected readonly logoutError = signal<string | null>(null);

  constructor() {
    let assistantWasOpen = false;
    afterRenderEffect(() => {
      const opened = this.assistantWorkspace.opened();
      // Before deferred code mounts, the shell owns loading/error focus too.
      if (!this.assistantHost()) {
        if (opened) this.assistantPendingCancel()?.nativeElement.focus();
        else if (assistantWasOpen)
          untracked(() =>
            this.assistantWorkspace.restoreFocus(
              this.assistantLauncher()?.nativeElement,
            ),
          );
      }
      assistantWasOpen = opened;
    });
    effect((onCleanup) => {
      if (!this.credentials.current()) return;
      onCleanup(
        bindAssistantShortcut(this.document, () =>
          this.assistantWorkspace.open(),
        ),
      );
    });
    effect(() => {
      this.url();
      this.assistantWorkspace.opened();
      // Programmatic navigation/back/forward must dismiss the native modal too.
      untracked(() => this.closeMenu());
    });
    inject(DestroyRef).onDestroy(() => this.closeMenu());
  }

  protected retrySession(): void {
    void this.session.retry();
  }

  protected toggleMenu(): void {
    if (this.menuOpen()) {
      this.closeMenu();
      return;
    }
    this.menuOpen.set(true);
    this.dialog()?.nativeElement.showModal();
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
    const dialog = this.dialog()?.nativeElement;
    if (dialog?.open) dialog.close();
  }

  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.content()?.nativeElement.focus();
  }

  protected async logout(): Promise<void> {
    this.logoutError.set(null);

    try {
      await this.session.logout();
      await this.router.navigateByUrl("/");
    } catch {
      this.logoutError.set(
        "No se pudo cerrar la sesión completamente. Inténtalo de nuevo.",
      );
    }
  }
}
