import { isPlatformBrowser } from "@angular/common";
import {
  afterNextRender,
  computed,
  effect,
  Injectable,
  inject,
  PLATFORM_ID,
  signal,
} from "@angular/core";
import { AuthCredentials } from "../../core/auth/auth-credentials";

export type OnboardingStatus = "active" | "skipped" | "completed";
const preferenceKey = (owner: string) => `lazyfinance:onboarding:v1:${owner}`;

/** Device preference only. Financial progress always comes from owned APIs. */
@Injectable({ providedIn: "root" })
export class OnboardingPreferences {
  private readonly credentials = inject(AuthCredentials);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly ready = signal(false);
  private readonly owner = computed(
    () => this.credentials.current()?.principal.userId,
  );
  private readonly record = signal<
    | { owner: string; status: OnboardingStatus; persistenceFailed: boolean }
    | undefined
  >(undefined);
  private readonly current = computed(() =>
    this.record()?.owner === this.owner() ? this.record() : undefined,
  );
  readonly status = computed(() => this.current()?.status);
  readonly persistenceFailed = computed(
    () => this.current()?.persistenceFailed ?? false,
  );

  constructor() {
    // Keep browser preferences out of SSR and the initial hydration DOM.
    afterNextRender(() => {
      if (this.browser) this.ready.set(true);
    });
    effect(() => {
      const owner = this.owner();
      if (!this.ready() || !owner) return;
      try {
        const stored = window.localStorage.getItem(preferenceKey(owner));
        this.record.set({
          owner,
          status:
            stored === "skipped" || stored === "completed" ? stored : "active",
          persistenceFailed: false,
        });
      } catch {
        this.record.set({ owner, status: "active", persistenceFailed: true });
      }
    });
  }

  setStatus(status: OnboardingStatus): void {
    const owner = this.owner();
    if (!owner || !this.browser || !this.ready()) return;
    let persistenceFailed = false;
    try {
      window.localStorage.setItem(preferenceKey(owner), status);
    } catch {
      persistenceFailed = true;
    }
    this.record.set({ owner, status, persistenceFailed });
  }
}
