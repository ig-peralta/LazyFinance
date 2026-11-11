import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseWorkspacePreferences,
  WorkspacePreferences,
  workspacePreferencesKey,
} from "./workspace-preferences";

describe("workspace presentation preferences", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it("defaults safely for missing, malformed and unsupported values", () => {
    for (const raw of [
      null,
      "{",
      "null",
      "[]",
      '{"theme":"sepia","textSize":900,"compact":"true"}',
    ]) {
      expect(parseWorkspacePreferences(raw)).toEqual({
        theme: "system",
        textSize: "standard",
        compact: false,
      });
    }
  });

  it("persists only allowlisted non-sensitive fields and restores all layout sizes", () => {
    for (const textSize of ["standard", "large", "largest"] as const) {
      const preferences = TestBed.inject(WorkspacePreferences);
      preferences.update({ theme: "light", textSize, compact: true });
      expect(
        parseWorkspacePreferences(
          localStorage.getItem(workspacePreferencesKey),
        ),
      ).toEqual({ theme: "light", textSize, compact: true });
      TestBed.resetTestingModule();
      expect(TestBed.inject(WorkspacePreferences).value().textSize).toBe(
        textSize,
      );
    }
    expect(
      parseWorkspacePreferences(
        '{"theme":"dark","token":"secret","draft":"private"}',
      ),
    ).toEqual({ theme: "dark", textSize: "standard", compact: false });
  });

  it("continues applying presentation when storage is unavailable", () => {
    const preferences = TestBed.inject(WorkspacePreferences);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Denied");
    });
    preferences.update({ textSize: "largest" });
    expect(preferences.value().textSize).toBe("largest");
    expect(preferences.storageUnavailable()).toBe(true);
  });
});
