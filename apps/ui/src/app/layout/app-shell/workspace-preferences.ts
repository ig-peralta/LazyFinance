import { isPlatformBrowser } from "@angular/common";
import { Injectable, inject, PLATFORM_ID, signal } from "@angular/core";

export type WorkspacePreferencesValue = {
  theme: "system" | "light" | "dark";
  textSize: "standard" | "large" | "largest";
  compact: boolean;
};

export const workspacePreferencesKey = "lazyfinance-workspace-preferences";

export function parseWorkspacePreferences(
  raw: string | null,
): WorkspacePreferencesValue {
  const defaults: WorkspacePreferencesValue = {
    theme: "system",
    textSize: "standard",
    compact: false,
  };
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return defaults;
    return {
      theme:
        "theme" in value && (value.theme === "light" || value.theme === "dark")
          ? value.theme
          : "system",
      textSize:
        "textSize" in value &&
        (value.textSize === "large" || value.textSize === "largest")
          ? value.textSize
          : "standard",
      compact: "compact" in value && value.compact === true,
    };
  } catch {
    return defaults;
  }
}

/** Device presentation only: never accepts identity, financial state or drafts. */
@Injectable({ providedIn: "root" })
export class WorkspacePreferences {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly state = signal(this.read());
  readonly value = this.state.asReadonly();
  readonly storageUnavailable = signal(false);

  private read(): WorkspacePreferencesValue {
    try {
      return parseWorkspacePreferences(
        this.browser ? localStorage.getItem(workspacePreferencesKey) : null,
      );
    } catch {
      return parseWorkspacePreferences(null);
    }
  }

  update(change: Partial<WorkspacePreferencesValue>): void {
    // Reconstruct through the allowlist even if a caller supplies extra fields.
    const next = parseWorkspacePreferences(
      JSON.stringify({ ...this.state(), ...change }),
    );
    this.state.set(next);
    try {
      if (this.browser)
        localStorage.setItem(workspacePreferencesKey, JSON.stringify(next));
      this.storageUnavailable.set(false);
    } catch {
      this.storageUnavailable.set(true);
    }
  }
}
