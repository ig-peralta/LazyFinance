import {
  computed,
  DestroyRef,
  effect,
  Injectable,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { AuthCredentials } from "../../core/auth/auth-credentials";

/** One shell-owned, memory-only session. Opening never sends or reloads a turn. */
@Injectable({ providedIn: "root" })
export class AssistantWorkspace {
  private readonly credentials = inject(AuthCredentials);
  private readonly visible = signal(false);
  readonly opened = computed(
    () => !!this.credentials.current() && this.visible(),
  );
  readonly selection = signal<string | undefined>(undefined);
  readonly focusRequest = signal(0);
  readonly modal = signal(false);
  private opener: HTMLElement | null = null;
  onMinimize: (() => void) | undefined;

  constructor() {
    if (typeof window !== "undefined" && window.matchMedia) {
      const media = window.matchMedia("(max-width: 720px)");
      const update = () => this.modal.set(media.matches);
      update();
      media.addEventListener("change", update);
      inject(DestroyRef).onDestroy(() =>
        media.removeEventListener("change", update),
      );
    }
    effect(() => {
      this.credentials.current();
      this.selection.set(undefined);
      this.visible.set(false);
      untracked(() => this.onMinimize?.());
      this.opener = null;
    });
  }

  open() {
    if (!this.credentials.current()) return;
    if (!this.opened())
      this.opener =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    this.visible.set(true);
    this.focusRequest.update((value) => value + 1);
  }

  minimize() {
    this.onMinimize?.();
    this.visible.set(false);
  }

  /** Called by the host after hidden-state rendering, not while the opener is hidden. */
  restoreFocus(fallback?: HTMLElement) {
    if (this.opened() || !this.credentials.current()) return;
    const opener = this.opener;
    if (
      opener?.isConnected &&
      opener !== opener.ownerDocument.body &&
      !opener.closest("[hidden], [inert], dialog:not([open])")
    ) {
      opener.focus();
      if (opener.ownerDocument.activeElement === opener) return;
    }
    // Route/deferred entry may remove the original invoker. The shell supplies
    // its persistent header control after hidden/inert-state rendering.
    fallback?.focus();
  }

  toggle() {
    if (this.opened()) this.minimize();
    else this.open();
  }
}
