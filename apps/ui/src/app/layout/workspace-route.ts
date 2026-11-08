import { NgComponentOutlet } from "@angular/common";
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  Injector,
  inject,
  type OnDestroy,
  signal,
  type Type,
} from "@angular/core";
import { ActivatedRoute, type Route } from "@angular/router";
import {
  WorkspaceEntry,
  WorkspacePagePreparation,
} from "../core/rendering/workspace-preparation";

export interface WorkspacePageDefinition {
  heading: string;
  load: () => Promise<Type<unknown>>;
}

/** An eager destination frame, rather than a router-blocking lazy component. */
@Component({
  selector: "workspace-route-page",
  imports: [NgComponentOutlet],
  providers: [WorkspacePagePreparation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (component(); as page) {
      <ng-container *ngComponentOutlet="page" />
    } @else {
      <section class="workspace-page-loading" [attr.aria-busy]="!failed()">
        <header class="page-heading"><div><p class="eyebrow">TU ESPACIO PERSONAL</p><h1>{{ definition.heading }}</h1></div></header>
        @if (failed()) { <div class="notice danger" role="alert">No pudimos cargar esta sección. <button type="button" class="button secondary" (click)="load()">Reintentar</button></div> }
        @else { <p class="sr-only" role="status">Cargando sección…</p><div class="workspace-page-skeleton" aria-hidden="true"><div></div><div></div><div></div></div> }
      </section>
    }
  `,
})
export class WorkspaceRoutePage implements OnDestroy {
  private readonly entry = inject(WorkspaceEntry, { optional: true });
  private readonly preparation = inject(WorkspacePagePreparation);
  private readonly injector = inject(Injector);
  protected readonly definition = inject(ActivatedRoute).snapshot.data[
    "page"
  ] as WorkspacePageDefinition;
  protected readonly component = signal<Type<unknown> | null>(null);
  protected readonly failed = signal(false);
  private revision = 0;

  constructor() {
    this.load();
    effect((onCleanup) => {
      const view = this.component()
        ? "screen"
        : this.failed()
          ? "error"
          : "loading";
      this.preparation.rendered("loading");
      if (view === "loading") return;
      const render = afterNextRender(() => this.preparation.rendered(view), {
        injector: this.injector,
      });
      onCleanup(() => render.destroy());
    });
  }

  protected load(): void {
    const revision = ++this.revision;
    this.failed.set(false);
    const pending = this.entry
      ? this.entry.loadScreen(this.definition.load)
      : this.definition.load();
    void pending
      .then((component) => {
        if (revision === this.revision) this.component.set(component);
      })
      .catch(() => {
        if (revision === this.revision) this.failed.set(true);
      });
  }

  ngOnDestroy(): void {
    ++this.revision;
  }
}

export function workspaceRoute(
  path: string,
  page: WorkspacePageDefinition,
): Route {
  return {
    path,
    title: page.heading,
    component: WorkspaceRoutePage,
    data: { page },
  };
}
