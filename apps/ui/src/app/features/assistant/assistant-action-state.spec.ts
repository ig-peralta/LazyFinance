import { describe, expect, it } from "vitest";
import { assistantAction } from "../../../testing/assistant";
import { latestAssistantAction } from "./assistant-action-state";

describe("monotonic request observations", () => {
  it("keeps corrections and receipts when an earlier history query settles late", () => {
    const first = assistantAction();
    const corrected = { ...first, version: 2 };
    const applied = { ...corrected, status: "applied" as const };
    expect(latestAssistantAction(corrected, first)).toBe(corrected);
    expect(latestAssistantAction(applied, corrected)).toBe(applied);
    expect(latestAssistantAction(first, corrected)).toBe(corrected);
    expect(latestAssistantAction(corrected, applied)).toBe(applied);
  });
});
