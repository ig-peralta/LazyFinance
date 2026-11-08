import { isPlatformBrowser } from "@angular/common";
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  effect,
  Injector,
  inject,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from "@angular/router";
import { filter } from "rxjs";
import { AuthCredentials } from "../core/auth/auth-credentials";
import { SessionService } from "../core/auth/session.service";
import { WorkspaceEntry } from "../core/rendering/workspace-preparation";
import { WorkspaceLoading } from "./workspace-loading";
import type { WorkspacePageDefinition } from "./workspace-route";

/** Eager, non-personalized entry. No private component exists before verification. */
@Component({
  selector: "workspace-boundary",
  imports: [RouterOutlet, RouterLink, WorkspaceLoading],
  providers: [WorkspaceEntry],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (owner of owners(); track owner) {
      <div #prepared class="workspace-prepared" [class.workspace-preparing]="!revealed()"
        [attr.inert]="revealed() ? null : ''" [attr.aria-hidden]="revealed() ? null : 'true'" tabindex="-1">
        <router-outlet />
      </div>
    }
    @if (!revealed()) {
      <workspace-loading [busy]="preparing()">
        @switch (viewStatus()) {
          @case ('error') { <h1>No pudimos abrir tu espacio</h1><p role="alert">{{ session.error() }}</p><button type="button" (click)="retry()">Reintentar</button> }
          @case ('timeout') { <h1>Tu espacio está tardando más de lo esperado</h1><p role="alert">Puedes volver a cargar la página para comprobar tu sesión y tus datos.</p><button type="button" (click)="reload()">Volver a cargar</button> }
          @case ('verification-required') { <h1>Verifica tu correo para continuar</h1><p>Confirma tu correo antes de acceder a tus finanzas.</p><a routerLink="/login" [queryParams]="{ redirect: destination() }">Comprobar verificación</a> }
          @case ('anonymous') { <h1>Inicia sesión para continuar</h1><a routerLink="/login" [queryParams]="{ redirect: destination() }">Iniciar sesión</a> }
          @default { <div role="status" aria-live="polite" aria-atomic="true"><h1>Preparando tu espacio</h1><p>Estamos preparando tu sesión y tus datos.</p></div> }
        }
      </workspace-loading>
    }
  `,
})
export class WorkspaceBoundary {
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly credentials = inject(AuthCredentials);
  private readonly entry = inject(WorkspaceEntry);
  private readonly navigation = toSignal(
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)),
  );
  private readonly prepared = viewChild<ElementRef<HTMLElement>>("prepared");
  private readonly minimumElapsed = signal(false);
  private readonly timedOut = signal(false);
  private readonly shownOwner = signal<string | undefined>(undefined);
  private minimumTimer?: ReturnType<typeof setTimeout>;
  private deadlineTimer?: ReturnType<typeof setTimeout>;
  private lastOwner?: string;
  protected readonly owners = computed(() => {
    const credentials = this.credentials.current();
    return this.session.status() === "ready" && credentials
      ? [credentials.principal.userId]
      : [];
  });
  protected readonly revealed = computed(() => {
    const owner = this.owners()[0];
    return !!owner && this.shownOwner() === owner;
  });
  protected readonly viewStatus = computed(() =>
    !this.minimumElapsed()
      ? "loading"
      : this.session.status() === "error"
        ? "error"
        : this.timedOut() &&
            ["idle", "loading", "ready"].includes(this.session.status())
          ? "timeout"
          : this.session.status() === "ready"
            ? "loading"
            : this.session.status(),
  );
  protected readonly preparing = computed(() =>
    ["idle", "loading"].includes(this.viewStatus()),
  );

  constructor() {
    void this.session.start();
    afterNextRender(() => {
      this.startPresentation();
    });
    this.destroyRef.onDestroy(() => this.clearTimers());
    effect(() => {
      this.navigation();
      if (!this.browser) return;
      let destination = this.route;
      while (destination.firstChild) destination = destination.firstChild;
      const page = destination.snapshot.data["page"] as
        | WorkspacePageDefinition
        | undefined;
      if (page) void this.entry.loadScreen(page.load).catch(() => undefined);
    });
    effect(() => {
      const owner = this.owners()[0];
      if (!owner) {
        this.shownOwner.set(undefined);
        return;
      }
      if (this.lastOwner && this.lastOwner !== owner) {
        this.shownOwner.set(undefined);
        untracked(() => this.startPresentation());
      }
      this.lastOwner = owner;
    });
    effect(() => {
      const owner = this.owners()[0];
      if (
        !owner ||
        this.revealed() ||
        !this.minimumElapsed() ||
        !this.entry.ready()
      )
        return;
      untracked(() => {
        this.shownOwner.set(owner);
        clearTimeout(this.deadlineTimer);
      });
    });
    effect((onCleanup) => {
      if (!this.revealed()) return;
      // Wait until the wrapper is no longer inert. Run only on entrance, not on
      // later resource reloads or internal navigation that may move keyboard focus.
      const render = afterNextRender(
        () => {
          const content = this.prepared()?.nativeElement;
          if (
            this.revealed() &&
            content &&
            !content.contains(this.document.activeElement)
          )
            content.focus({ preventScroll: true });
        },
        { injector: this.injector },
      );
      onCleanup(() => render.destroy());
    });
    effect(() => {
      if (this.viewStatus() !== "anonymous") return;
      untracked(() => {
        void this.router.navigate(["/login"], {
          queryParams: { redirect: this.destination() },
          replaceUrl: true,
        });
      });
    });
  }

  protected destination(): string {
    return (
      this.router.currentNavigation()?.finalUrl?.toString() ?? this.router.url
    );
  }

  protected retry(): void {
    void this.session.retry();
  }

  protected reload(): void {
    this.document.location.reload();
  }

  private startPresentation(): void {
    this.clearTimers();
    this.minimumElapsed.set(false);
    this.timedOut.set(false);
    this.minimumTimer = setTimeout(() => this.minimumElapsed.set(true), 1_000);
    this.deadlineTimer = setTimeout(() => this.timedOut.set(true), 15_000);
  }

  private clearTimers(): void {
    clearTimeout(this.minimumTimer);
    clearTimeout(this.deadlineTimer);
  }
}
