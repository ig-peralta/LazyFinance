import {
  computed,
  effect,
  Injectable,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { AuthCredentials } from "../../core/auth/auth-credentials";

/** One shell-owned, memory-only session. Opening never sends or reloads a turn. */
type VoiceState =
  | "off"
  | "connecting"
  | "listening"
  | "querying"
  | "responding"
  | "muted";

@Injectable({ providedIn: "root" })
export class AssistantWorkspace {
  private readonly credentials = inject(AuthCredentials);
  private readonly visible = signal(false);
  private readonly collapsed = signal(false);
  readonly opened = computed(
    () => !!this.credentials.current() && this.visible(),
  );
  readonly minimized = computed(
    () => !!this.credentials.current() && this.collapsed() && !this.home(),
  );
  readonly selection = signal<string | undefined>(undefined);
  readonly focusRequest = signal(0);
  readonly home = signal(false);
  readonly modal = computed(() => !this.home());
  readonly voiceState = signal<VoiceState>("off");
  readonly textPending = signal(false);
  private opener: HTMLElement | null = null;
  onMinimize: (() => void) | undefined;
  onDemoDataReset: (() => void) | undefined;
  onMuteVoice: (() => void) | undefined;
  onEndVoice: (() => void) | undefined;

  constructor() {
    effect(() => {
      this.credentials.current();
      this.selection.set(undefined);
      this.visible.set(false);
      this.collapsed.set(false);
      this.voiceState.set("off");
      this.textPending.set(false);
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
    this.collapsed.set(false);
    this.visible.set(true);
    this.focusRequest.update((value) => value + 1);
  }

  minimize(showBubble = true) {
    this.onMinimize?.();
    this.collapsed.set(showBubble);
    this.visible.set(false);
  }

  muteVoice() {
    this.onMuteVoice?.();
  }

  endVoice() {
    this.onEndVoice?.();
  }

  demoDataReset() {
    this.onDemoDataReset?.();
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
