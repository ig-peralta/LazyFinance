import {
  afterNextRender,
  computed,
  DestroyRef,
  effect,
  Injectable,
  Injector,
  inject,
  type Resource,
  type Signal,
  signal,
  type Type,
} from "@angular/core";
import {
  AuthCredentials,
  type VerifiedCredentials,
} from "../auth/auth-credentials";

type ScreenLoader = () => Promise<Type<unknown>>;
type InitialResource = Pick<Resource<unknown>, "status">;

/** Presentation/code preparation only: never stores financial responses or starts API reads. */
@Injectable()
export class WorkspaceEntry {
  private readonly page = signal<WorkspacePagePreparation | undefined>(
    undefined,
  );
  private readonly imports = new Map<ScreenLoader, Promise<Type<unknown>>>();
  readonly ready = computed(() => this.page()?.ready() ?? false);

  loadScreen(load: ScreenLoader): Promise<Type<unknown>> {
    const existing = this.imports.get(load);
    if (existing) return existing;
    const pending = Promise.resolve().then(load);
    this.imports.set(load, pending);
    void pending.catch(() => {
      if (this.imports.get(load) === pending) this.imports.delete(load);
    });
    return pending;
  }

  attach(page: WorkspacePagePreparation, owner: DestroyRef): void {
    this.page.set(page);
    owner.onDestroy(() => {
      if (this.page() === page) this.page.set(undefined);
    });
  }
}

/** One route host and its actually mounted page/widgets; status signals, not a data cache. */
@Injectable()
export class WorkspacePagePreparation {
  private readonly credentials = inject(AuthCredentials);
  private readonly injector = inject(Injector);
  private readonly checks = signal<readonly Signal<boolean>[]>([]);
  private readonly view = signal<"loading" | "screen" | "error">("loading");
  private readonly confirmed = signal<VerifiedCredentials | undefined>(
    undefined,
  );
  private readonly settled = computed(
    () =>
      this.view() === "error" ||
      (this.view() === "screen" &&
        this.checks().length > 0 &&
        this.checks().every((check) => check())),
  );
  readonly ready = computed(() => {
    const credentials = this.credentials.current();
    return !!credentials && this.confirmed() === credentials && this.settled();
  });

  constructor() {
    inject(WorkspaceEntry, { optional: true })?.attach(
      this,
      inject(DestroyRef),
    );
    effect((onCleanup) => {
      const credentials = this.credentials.current();
      const settled = this.settled();
      this.confirmed.set(undefined);
      if (!credentials || !settled) return;

      // Confirm after rendering: conditional children (e.g. a savings measurement)
      // must have mounted/registered before their parent's completed read can reveal UI.
      const render = afterNextRender(
        () => {
          if (this.credentials.current() === credentials && this.settled())
            this.confirmed.set(credentials);
        },
        { injector: this.injector },
      );
      onCleanup(() => render.destroy());
    });
  }

  rendered(view: "loading" | "screen" | "error"): void {
    this.view.set(view);
  }

  watch(check: Signal<boolean>, owner: DestroyRef): void {
    this.checks.update((checks) => [...checks, check]);
    owner.onDestroy(() =>
      this.checks.update((checks) => checks.filter((item) => item !== check)),
    );
  }
}

/** A defaultValue is not evidence that the first request completed. Errors have a usable view. */
export function initialReadSettled(resource: InitialResource): boolean {
  const status = resource.status();
  return status === "resolved" || status === "local" || status === "error";
}

/** Declare only initial visible reads; unopened editors, pagination and suggestions stay lazy. */
export function reportWorkspaceReadiness(
  ...dependencies: (InitialResource | (() => boolean))[]
): void {
  const preparation = inject(WorkspacePagePreparation, { optional: true });
  if (!preparation) return; // Standalone widgets/tests do not require a workspace boundary.
  preparation.watch(
    computed(() =>
      dependencies.every((dependency) =>
        typeof dependency === "function"
          ? dependency()
          : initialReadSettled(dependency),
      ),
    ),
    inject(DestroyRef),
  );
}
